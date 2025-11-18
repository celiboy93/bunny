import { 
  S3Client, 
  CreateMultipartUploadCommand, 
  UploadPartCommand, 
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from "npm:@aws-sdk/client-s3";
import { FetchHttpHandler } from "npm:@smithy/fetch-http-handler";

// --- Configuration ---
const BUNNY_STORAGE_ZONE_NAME = "testlugyi"; 
const BUNNY_REGION = "sg"; 
const BUNNY_ENDPOINT = `https://${BUNNY_REGION}.storage.bunnycdn.com`;

Deno.serve(async (req) => {
  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
  const BUNNY_PULL_ZONE_URL = Deno.env.get("BUNNY_PULL_ZONE_URL");

  if (!BUNNY_API_KEY || !BUNNY_PULL_ZONE_URL) {
    return new Response("Configuration Error: Missing Environment Variables", { status: 500 });
  }

  const url = new URL(req.url);

  // 1. Frontend UI
  if (req.method === "GET" && url.pathname === "/") {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Bunny Stream Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f7f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 100%; max-width: 400px; text-align: center; }
          h2 { margin-top: 0; color: #2d3436; font-size: 22px; }
          p { color: #636e72; font-size: 14px; margin-bottom: 25px; }
          
          input { width: 100%; padding: 14px; margin-bottom: 15px; box-sizing: border-box; border: 1px solid #dfe6e9; border-radius: 8px; outline: none; transition: 0.3s; font-size: 14px; }
          input:focus { border-color: #0984e3; box-shadow: 0 0 0 3px rgba(9, 132, 227, 0.1); }
          
          button { width: 100%; padding: 14px; background: #0984e3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600; transition: 0.2s; }
          button:hover { background: #74b9ff; }
          button:disabled { background: #b2bec3; cursor: not-allowed; }

          /* Animation & Status */
          .status-container { display: none; margin-top: 30px; }
          .spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0984e3; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          
          .status-text { font-size: 14px; color: #2d3436; font-weight: 500; line-height: 1.5; }
          
          /* Success/Error */
          .result-box { display: none; margin-top: 20px; text-align: left; animation: fadeIn 0.5s; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          textarea { width: 100%; padding: 10px; background: #f1f2f6; border: 1px dashed #b2bec3; border-radius: 6px; margin-top: 10px; font-size: 13px; color: #2d3436; resize: none; box-sizing: border-box; }
          .btn-restart { background: #00b894; margin-top: 15px; }
          .btn-restart:hover { background: #55efc4; }
          .error-msg { color: #d63031; background: #ff767533; padding: 10px; border-radius: 6px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div id="formSection">
            <h2>Remote Uploader</h2>
            <p>Upload large files to BunnyCDN seamlessly.</p>
            <form id="uploadForm">
              <input type="url" id="fileUrl" required placeholder="Paste Remote URL here..." />
              <input type="text" id="fileName" placeholder="Filename (e.g. video.mp4)" />
              <button type="submit" id="submitBtn">Start Upload</button>
            </form>
          </div>

          <div class="status-container" id="statusSection">
            <div class="spinner"></div>
            <div class="status-text" id="statusText">Initializing...</div>
            <div style="font-size: 12px; color: #b2bec3; margin-top: 5px;">Please do not close this tab.</div>
          </div>

          <div class="result-box" id="resultSection"></div>
        </div>

        <script>
          const form = document.getElementById('uploadForm');
          const statusSection = document.getElementById('statusSection');
          const statusText = document.getElementById('statusText');
          const formSection = document.getElementById('formSection');
          const resultSection = document.getElementById('resultSection');

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // UI Transitions
            formSection.style.display = 'none';
            statusSection.style.display = 'block';
            resultSection.style.display = 'none';
            statusText.innerText = "Connecting to server...";

            const formData = new FormData();
            formData.append('fileUrl', document.getElementById('fileUrl').value);
            formData.append('fileName', document.getElementById('fileName').value);

            try {
              const response = await fetch('/upload', { method: 'POST', body: formData });
              
              // Setup Stream Reader
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let finalBuffer = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                
                // Check if chunk contains the final JSON result
                if (chunk.includes('{"success":') || chunk.includes('{"error":')) {
                   finalBuffer += chunk;
                } else {
                   // It is a progress update message
                   if(chunk.trim()) statusText.innerText = chunk;
                }
              }

              // Process Final Result
              try {
                 // Extract JSON from buffer (incase connection closed with mixed content)
                 const jsonStr = finalBuffer.substring(finalBuffer.indexOf('{'));
                 const data = JSON.parse(jsonStr);
                 
                 statusSection.style.display = 'none';
                 resultSection.style.display = 'block';

                 if (data.success) {
                   resultSection.innerHTML = \`
                     <h3 style="color:#00b894; margin:0;">✅ Upload Complete</h3>
                     <p style="margin:5px 0; font-size:13px;">\${data.fileName}</p>
                     <textarea rows="3" onclick="this.select()">\${data.link}</textarea>
                     <button class="btn-restart" onclick="location.reload()">Upload Another File</button>
                   \`;
                 } else {
                   throw new Error(data.error);
                 }
              } catch (jsonErr) {
                 if(finalBuffer.includes("error")) {
                    throw new Error(finalBuffer);
                 }
                 // Fallback if JSON parsing fails but no error text found
                 throw new Error("Stream ended unexpectedly.");
              }

            } catch (err) {
              statusSection.style.display = 'none';
              formSection.style.display = 'block'; // Show form again
              alert("Error: " + err.message);
            }
          });
        </script>
      </body>
      </html>
    `;
    return new Response(html, { headers: { "content-type": "text/html" } });
  }

  // 2. Backend Logic (Manual Multipart + No Timeout)
  if (req.method === "POST" && url.pathname === "/upload") {
    // Helper to stream text back to client
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    
    const sendUpdate = async (msg: string) => {
        try { await writer.write(encoder.encode(msg)); } catch(e){}
    };

    (async () => {
        let uploadId;
        let s3;
        let fileName;
        
        try {
            const formData = await req.formData();
            const remoteUrl = formData.get("fileUrl") as string;
            fileName = formData.get("fileName") as string;

            if (!remoteUrl) throw new Error("Remote URL is required");
            if (!fileName) fileName = remoteUrl.split('/').pop() || `file-${Date.now()}.bin`;

            await sendUpdate("Fetching remote stream...");
            const remoteRes = await fetch(remoteUrl);
            if (!remoteRes.body) throw new Error("Failed to fetch remote file stream.");

            // Initialize S3 with Timeout Disabled
            s3 = new S3Client({
                region: "us-east-1", // Dummy region
                endpoint: BUNNY_ENDPOINT,
                credentials: {
                    accessKeyId: BUNNY_STORAGE_ZONE_NAME,
                    secretAccessKey: BUNNY_API_KEY,
                },
                forcePathStyle: true,
                requestHandler: new FetchHttpHandler({
                    requestTimeout: 0, 
                    connectionTimeout: 0
                })
            });

            await sendUpdate("Initializing Upload...");
            const createCmd = new CreateMultipartUploadCommand({
                Bucket: BUNNY_STORAGE_ZONE_NAME,
                Key: fileName,
                ContentType: "application/octet-stream",
            });
            const createRes = await s3.send(createCmd);
            uploadId = createRes.UploadId;

            // Chunking & Upload Loop
            const reader = remoteRes.body.getReader();
            const uploadParts = [];
            let buffer = new Uint8Array(0);
            let partNumber = 1;
            const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    const newBuffer = new Uint8Array(buffer.length + value.length);
                    newBuffer.set(buffer);
                    newBuffer.set(value, buffer.length);
                    buffer = newBuffer;
                }

                if (buffer.length >= CHUNK_SIZE || (done && buffer.length > 0)) {
                    while (buffer.length >= CHUNK_SIZE || (done && buffer.length > 0)) {
                        const limit = Math.min(buffer.length, CHUNK_SIZE);
                        const chunk = buffer.slice(0, limit);
                        buffer = buffer.slice(limit);

                        // Retry Logic (3 attempts)
                        let uploaded = false;
                        let attempts = 0;
                        while (!uploaded && attempts < 3) {
                            try {
                                attempts++;
                                await sendUpdate(`Uploading Part ${partNumber}...`);
                                
                                const partCmd = new UploadPartCommand({
                                    Bucket: BUNNY_STORAGE_ZONE_NAME,
                                    Key: fileName,
                                    UploadId: uploadId,
                                    PartNumber: partNumber,
                                    Body: chunk,
                                });
                                const partRes = await s3.send(partCmd);
                                uploadParts.push({ PartNumber: partNumber, ETag: partRes.ETag });
                                uploaded = true;
                            } catch (e) {
                                console.error(`Error part ${partNumber}:`, e);
                                await sendUpdate(`Part ${partNumber} failed. Retrying (${attempts}/3)...`);
                                if (attempts >= 3) throw e;
                                await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                            }
                        }
                        partNumber++;
                        if (buffer.length === 0) break;
                    }
                }
                if (done) break;
            }

            await sendUpdate("Finalizing file...");
            const completeCmd = new CompleteMultipartUploadCommand({
                Bucket: BUNNY_STORAGE_ZONE_NAME,
                Key: fileName,
                UploadId: uploadId,
                MultipartUpload: { Parts: uploadParts },
            });
            await s3.send(completeCmd);

            // Send Success JSON
            const successData = JSON.stringify({ 
                success: true, 
                fileName: fileName,
                link: `${BUNNY_PULL_ZONE_URL}/${fileName}`
            });
            await writer.write(encoder.encode(successData));

        } catch (err) {
            console.error("Upload Error:", err);
            if (uploadId && s3 && fileName) {
                try { await s3.send(new AbortMultipartUploadCommand({ Bucket: BUNNY_STORAGE_ZONE_NAME, Key: fileName, UploadId: uploadId })); } catch (e) {}
            }
            const errorData = JSON.stringify({ error: err.message });
            await writer.write(encoder.encode(errorData));
        } finally {
            await writer.close();
        }
    })();

    return new Response(readable, { headers: { "content-type": "text/plain" } });
  }

  return new Response("Not Found", { status: 404 });
});
