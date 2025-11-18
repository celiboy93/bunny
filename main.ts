const BUNNY_STORAGE_NAME = "testlugyi"; 
const BUNNY_REGION = "sg.storage"; 

Deno.serve(async (req) => {
  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
  const BUNNY_PULL_ZONE_URL = Deno.env.get("BUNNY_PULL_ZONE_URL"); 

  if (!BUNNY_API_KEY || !BUNNY_PULL_ZONE_URL) {
    return new Response("Configuration Error: Missing Env Vars", { status: 500 });
  }

  const url = new URL(req.url);

  // 1. Frontend UI (HTML + CSS + Client JS)
  if (req.method === "GET" && url.pathname === "/") {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bunny Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .container { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05); width: 100%; max-width: 420px; text-align: center; }
          h2 { color: #2c3e50; margin-bottom: 20px; font-size: 24px; }
          input { width: 100%; padding: 14px; margin-bottom: 15px; border: 2px solid #eef2f7; border-radius: 8px; outline: none; transition: 0.3s; box-sizing: border-box; font-size: 14px; }
          input:focus { border-color: #3498db; }
          button { width: 100%; padding: 14px; cursor: pointer; background: #3498db; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; transition: 0.3s; }
          button:hover { background: #2980b9; }
          
          /* Loading Spinner */
          .loader-container { display: none; margin-top: 20px; }
          .spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .status-text { color: #7f8c8d; font-size: 14px; }

          /* Success/Error Areas */
          #resultArea { display: none; margin-top: 20px; text-align: left; }
          .success-box { background: #e8f8f5; border: 1px solid #2ecc71; padding: 20px; border-radius: 8px; text-align: center; }
          textarea { width: 100%; padding: 10px; margin-top: 10px; border: 1px dashed #27ae60; background: #fff; border-radius: 4px; resize: none; font-size: 13px; color: #2c3e50; box-sizing: border-box;}
          .error-box { background: #fdedec; border: 1px solid #e74c3c; color: #c0392b; padding: 15px; border-radius: 8px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div id="formSection">
            <h2>🚀 Remote Uploader</h2>
            <form id="uploadForm">
              <input type="url" id="fileUrl" required placeholder="Paste direct URL here..." />
              <input type="text" id="fileName" placeholder="Filename (optional)" />
              <button type="submit">Start Upload</button>
            </form>
          </div>

          <div class="loader-container" id="loader">
            <div class="spinner"></div>
            <div class="status-text">Streaming to BunnyCDN...<br>Please wait, do not close.</div>
          </div>

          <div id="resultArea"></div>
        </div>

        <script>
          const form = document.getElementById('uploadForm');
          const formSection = document.getElementById('formSection');
          const loader = document.getElementById('loader');
          const resultArea = document.getElementById('resultArea');

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileUrl = document.getElementById('fileUrl').value;
            const fileName = document.getElementById('fileName').value;

            // UI Updates
            formSection.style.display = 'none';
            loader.style.display = 'block';
            resultArea.style.display = 'none';

            const formData = new FormData();
            formData.append('fileUrl', fileUrl);
            formData.append('fileName', fileName);

            try {
              const res = await fetch('/upload', { method: 'POST', body: formData });
              const data = await res.json();

              loader.style.display = 'none';
              resultArea.style.display = 'block';

              if (res.ok) {
                resultArea.innerHTML = \`
                  <div class="success-box">
                    <h3 style="color:#27ae60; margin:0 0 10px 0;">✅ Upload Complete</h3>
                    <p style="font-size:12px; color:#555; margin-bottom:5px;">\${data.fileName}</p>
                    <textarea rows="3" onclick="this.select()">\${data.link}</textarea>
                    <button onclick="location.reload()" style="margin-top:15px; background:#2ecc71;">Upload Another</button>
                  </div>
                \`;
              } else {
                throw new Error(data.error || 'Upload failed');
              }
            } catch (err) {
              loader.style.display = 'none';
              formSection.style.display = 'block'; // Show form again
              alert('Error: ' + err.message);
            }
          });
        </script>
      </body>
      </html>
    `;
    return new Response(html, { headers: { "content-type": "text/html" } });
  }

  // 2. Backend Logic
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const remoteUrl = formData.get("fileUrl") as string;
      let fileName = formData.get("fileName") as string;

      if (!remoteUrl) return Response.json({ error: "URL required" }, { status: 400 });
      if (!fileName) fileName = remoteUrl.split('/').pop() || `file-${Date.now()}.bin`;

      const remoteRes = await fetch(remoteUrl);
      if (!remoteRes.body) throw new Error("Cannot fetch remote file");

      const bunnyUrl = `https://${BUNNY_REGION}.bunnycdn.com/${BUNNY_STORAGE_NAME}/${fileName}`;
      
      const uploadRes = await fetch(bunnyUrl, {
        method: "PUT",
        headers: {
            "AccessKey": BUNNY_API_KEY, 
            "Content-Type": "application/octet-stream"
        },
        body: remoteRes.body 
      });

      if (uploadRes.ok) {
        return Response.json({ 
          success: true, 
          fileName: fileName,
          link: `${BUNNY_PULL_ZONE_URL}/${fileName}`
        });
      } else {
        const txt = await uploadRes.text();
        return Response.json({ error: txt }, { status: 500 });
      }

    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
