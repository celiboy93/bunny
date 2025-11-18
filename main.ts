const BUNNY_STORAGE_NAME = "testlugyi"; 
const BUNNY_REGION = "sg.storage"; 

Deno.serve(async (req) => {
  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");

  if (!BUNNY_API_KEY) {
    return new Response("Error: BUNNY_API_KEY is missing in Deno Deploy Settings.", { status: 500 });
  }

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/") {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bunny Remote Uploader (SG)</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; background-color: #f4f4f9; }
          h2 { color: #333; }
          input { width: 100%; padding: 12px; margin-bottom: 15px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
          button { width: 100%; padding: 12px; cursor: pointer; background: #007bff; color: white; border: none; font-size: 16px; border-radius: 4px; }
          button:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <h2>BunnyCDN Remote Upload (Singapore)</h2>
        <form method="POST" action="/upload">
          <p><strong>Remote File URL:</strong></p>
          <input type="url" name="fileUrl" required placeholder="https://example.com/video.mp4" />
          <p><strong>Save Filename (Optional):</strong></p>
          <input type="text" name="fileName" placeholder="video.mp4" />
          <button type="submit">Start Upload</button>
        </form>
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
        return new Response(`<b>Upload Success!</b><br>File: ${fileName}<br><br><a href="/">Upload Another File</a>`, { headers: { "content-type": "text/html" } });
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
