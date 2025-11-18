const BUNNY_STORAGE_NAME = "testlugyi"; 
const BUNNY_REGION = "sg.storage"; 

Deno.serve(async (req) => {
  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
  const BUNNY_PULL_ZONE_URL = Deno.env.get("BUNNY_PULL_ZONE_URL"); // New Env Var

  if (!BUNNY_API_KEY || !BUNNY_PULL_ZONE_URL) {
    return new Response("Configuration Error: BUNNY_API_KEY or BUNNY_PULL_ZONE_URL is missing in Settings.", { status: 500 });
  }

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/") {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bunny Remote Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #eef1f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .container { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); width: 100%; max-width: 450px; }
          h2 { color: #34495e; text-align: center; margin-bottom: 25px; }
          p { margin-top: 0; font-weight: 500; color: #555; }
          input[type="url"], input[type="text"] { width: 100%; padding: 12px; margin-bottom: 20px; box-sizing: border-box; border: 1px solid #bdc3c7; border-radius: 6px; transition: border-color 0.3s; }
          input:focus { border-color: #3498db; outline: none; }
          button { width: 100%; padding: 12px; cursor: pointer; background: #2ecc71; color: white; border: none; font-size: 16px; border-radius: 6px; transition: background 0.3s; }
          button:hover { background: #27ae60; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>BunnyCDN Remote Uploader</h2>
          <form method="POST" action="/upload">
            <p>Remote File URL:</p>
            <input type="url" name="fileUrl" required placeholder="Paste external file link here..." />
            <p>Save Filename (Optional):</p>
            <input type="text" name="fileName" placeholder="e.g., my-video.mp4" />
            <button type="submit">Start Upload</button>
          </form>
        </div>
      </body>
      </html>
    `;
    return new Response(html, { headers: { "content-type": "text/html" } });
  }

  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const remoteUrl = formData.get("fileUrl") as string;
      let fileName = formData.get("fileName") as string;

      if (!remoteUrl) return new Response("URL is required", { status: 400 });
      if (!fileName) fileName = remoteUrl.split('/').pop() || `file-${Date.now()}.bin`;

      const remoteRes = await fetch(remoteUrl);
      if (!remoteRes.body) throw new Error("Cannot get file stream from remote URL");

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
        const publicLink = `${BUNNY_PULL_ZONE_URL}/${fileName}`;
        const successHtml = `
          <div class="container" style="text-align: center;">
            <h2>✅ Upload Successful!</h2>
            <p style="color: #2ecc71; font-size: 1.1em; word-wrap: break-word;">File: ${fileName}</p>
            <p style="margin-top: 30px;"><strong>Public Direct Link:</strong></p>
            <textarea rows="3" style="width: 100%; padding: 10px; border: 1px dashed #3498db; background-color: #ecf0f1; resize: none;" onclick="this.select();">${publicLink}</textarea>
            <a href="/" style="display: block; margin-top: 20px; text-decoration: none;">
              <button style="background: #3498db;">Upload Another File</button>
            </a>
          </div>
        `;
        return new Response(successHtml, { headers: { "content-type": "text/html" } });
      } else {
        const errorText = await uploadRes.text();
        return new Response(`<b>Upload Failed</b><br>Status: ${uploadRes.status}<br>Message: ${errorText}`, { headers: { "content-type": "text/html" } });
      }

    } catch (err) {
      return new Response(`Internal Error: ${err.message}`, { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
