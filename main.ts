import { 
  S3Client, 
  CreateMultipartUploadCommand, 
  UploadPartCommand, 
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from "npm:@aws-sdk/client-s3";

// --- Configuration ---
const BUNNY_STORAGE_ZONE_NAME = "testlugyi"; 
const BUNNY_REGION = "sg"; 
const BUNNY_ENDPOINT = `https://${BUNNY_REGION}.storage.bunnycdn.com`;

Deno.serve(async (req) => {
  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
  const BUNNY_PULL_ZONE_URL = Deno.env.get("BUNNY_PULL_ZONE_URL");

  if (!BUNNY_API_KEY || !BUNNY_PULL_ZONE_URL) {
    return new Response("Configuration Error: Missing Env Vars", { status: 500 });
  }

  const url = new URL(req.url);

  // 1. Frontend UI
  if (req.method === "GET" && url.pathname === "/") {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bunny Manual Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .container { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 450px; text-align: center; }
          h2 { margin-top: 0; color: #333; }
          input { width: 100%; padding: 12px; margin-bottom: 15px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; }
          button { width: 100%; padding: 12px; background: #000; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
          button:hover { background: #333; }
          .loader { display: none; margin: 15px auto; font-size: 14px; color: #666; }
          .result { display: none; margin-top: 20px; text-align: left; word-break: break-all;}
          textarea { width: 100%; margin-top: 10px; background: #eee; border: none; padding: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div id="formSection">
            <h2>🐰 Robust Uploader</h2>
            <p style="font-size: 12px; color: #666;">Manual Multipart Strategy</p>
            <form id="uploadForm">
              <input type="url" id="fileUrl" required placeholder="Remote File URL" />
              <input type="text" id="fileName" placeholder="Filename (e.g. movie.mp4)" />
              <button type="submit">Upload</button>
            </form>
          </div>
          
          <div class="loader" id="loader">Uploading... Please wait (Do not close)</div>
          <div class="result" id="resultArea"></div>
        </div>
        <script>
          const form = document.getElementById('uploadForm');
          const loader = document.getElementById('loader');
          const resultArea = document.getElementById('resultArea');
          const formSection = document.getElementById('formSection');

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            formSection.style.display = 'none';
            loader.style.display = 'block';
            resultArea.style.display = 'none';
            
            const formData = new FormData();
            formData.append('fileUrl', document.getElementById('fileUrl').value);
            formData.append('fileName', document.getElementById('fileName').value);

            try {
              const res = await fetch('/upload', { method: 'POST', body: formData });
              const data = await res.json();
              loader.style.display = 'none';
              resultArea.style.display = 'block';
              
              if (res.ok) {
                resultArea.innerHTML = \`<h3 style="color:green;margin:0;">✅ Success</h3><p>File: \${data.fileName}</p> <textarea rows="3" onclick="this.select()">\${data.link}</textarea><a href="/"><button style="margin-top:10px;">Upload Another</button></a>\`;
              } else {
                resultArea.innerHTML = \`<h3 style="color:red;margin:0;">❌ Failed</h3><p>\${data.error}</p>\`;
              }
            } catch (err) {
              loader.style.display = 'none';
              formSection.style.display = 'block';
              alert("Error: " + err.message);
            }
          });
        </script>
      </body>
      </html>
    `;
    return new Response(html, { headers: { "content-type": "text/html" } });
  }

  // 2. Backend Logic (MANUAL MULTIPART)
  if (req.method === "POST" && url.pathname === "/upload") {
    let uploadId;
    let s3;
    let fileName;

    try {
      const formData = await req.formData();
      const remoteUrl = formData.get("fileUrl") as string;
      fileName = formData.get("fileName") as string;

      if (!remoteUrl) return Response.json({ error: "URL required" }, { status: 400 });
      if (!fileName) fileName = remoteUrl.split('/').pop() || `file-${Date.now()}.bin`;

      const remoteRes = await fetch(remoteUrl);
      if (!remoteRes.body) throw new Error("Cannot get remote stream");

      // Initialize S3 Client
      s3 = new S3Client({
        region: "us-east-1", // Dummy region to avoid SDK strictness
        endpoint: BUNNY_ENDPOINT,
        credentials: {
          accessKeyId: BUNNY_STORAGE_ZONE_NAME,
          secretAccessKey: BUNNY_API_KEY,
        },
        forcePathStyle: true,
      });

      // A. Start Multipart Upload
      const createCmd = new CreateMultipartUploadCommand({
        Bucket: BUNNY_STORAGE_ZONE_NAME,
        Key: fileName,
        ContentType: "application/octet-stream",
      });
      const createRes = await s3.send(createCmd);
      uploadId = createRes.UploadId;
      console.log("Upload started ID:", uploadId);

      // B. Chunking & Uploading Loop
      const reader = remoteRes.body.getReader();
      let partNumber = 1;
      const uploadParts = [];
      let buffer = new Uint8Array(0);
      const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

      while (true) {
        const { done, value } = await reader.read();
        
        if (value) {
          // Append new data to buffer
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
        }

        // If buffer is big enough OR stream is done, upload chunk
        if (buffer.length >= CHUNK_SIZE || (done && buffer.length > 0)) {
          while (buffer.length >= CHUNK_SIZE || (done && buffer.length > 0)) {
             // Slice a chunk
             const limit = Math.min(buffer.length, CHUNK_SIZE);
             const chunk = buffer.slice(0, limit);
             // Keep the rest
             buffer = buffer.slice(limit);

             // Upload Part
             const partCmd = new UploadPartCommand({
               Bucket: BUNNY_STORAGE_ZONE_NAME,
               Key: fileName,
               UploadId: uploadId,
               PartNumber: partNumber,
               Body: chunk,
             });
             
             const partRes = await s3.send(partCmd);
             
             // Important: Bunny might return ETag in quotes or not, handled by SDK usually but we verify
             uploadParts.push({
               PartNumber: partNumber,
               ETag: partRes.ETag,
             });
             
             console.log(`Uploaded Part ${partNumber}`);
             partNumber++;
             
             if (buffer.length === 0) break;
          }
        }

        if (done) break;
      }

      // C. Complete Upload
      const completeCmd = new CompleteMultipartUploadCommand({
        Bucket: BUNNY_STORAGE_ZONE_NAME,
        Key: fileName,
        UploadId: uploadId,
        MultipartUpload: { Parts: uploadParts },
      });
      await s3.send(completeCmd);

      return Response.json({ 
        success: true, 
        fileName: fileName,
        link: `${BUNNY_PULL_ZONE_URL}/${fileName}`
      });

    } catch (err) {
      console.error("Upload Error:", err);
      
      // Try to abort if failed
      if (uploadId && s3 && fileName) {
        try {
          await s3.send(new AbortMultipartUploadCommand({
             Bucket: BUNNY_STORAGE_ZONE_NAME,
             Key: fileName,
             UploadId: uploadId
          }));
        } catch (e) { /* ignore abort error */ }
      }

      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
