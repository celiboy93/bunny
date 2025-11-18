// main.ts
const BUNNY_STORAGE_NAME = "testlugyi"; 
const BUNNY_REGION = "storage"; // Storage region: 'la', 'ny', 'sg' or default 'storage'

Deno.serve(async (req) => {
  // Get API Key from Environment Variable (BUNNY_API_KEY must be set in Deno Deploy Settings)
  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");

  if (!BUNNY_API_KEY) {
    return new Response("Error: BUNNY_API_KEY is missing in Deno Deploy Settings.", { status: 500 });
  }

  const url = new URL(req.url);

  // 1. Home Page (GET /)
  if (req.method === "GET" && url.pathname === "/") {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bunny Remote Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; }
          input { width: 100%; padding: 12px; margin-bottom: 15px; box-sizing: border-box; }
          button { width: 100%; padding: 12px; cursor: pointer; background: #007bff; color: white; border: none; font-size: 16px; }
        </style>
      </head>
      <body>
        <h2>BunnyCDN Remote Upload Tool</h2>
        <form method="POST" action="/upload">
          <p>Remote File URL:</p>
          <input type="url" name="fileUrl" required placeholder="https://example.com/video.mp4" />
          <p>Save Filename (Optional):</p>
          <input type="text" name="fileName" placeholder="video.mp4" />
          <button type="submit">Start Stream Upload</button>
        </form>
      </body>
      </html>
    `;
    return new Response(html, { headers: { "content-type": "text/html" } });
  }

  // 2. Upload Logic (POST /upload)
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const remoteUrl = formData.get("fileUrl") as string;
      let fileName = formData.get("fileName") as string;

      if (!remoteUrl) return new Response("URL is required", { status: 400 });
      if (!fileName) fileName = remoteUrl.split('/').pop() || `file-${Date.now()}.bin`;

      // Fetch from Remote (Stream pipe starts here)
      const remoteRes = await fetch(remoteUrl);
      if (!remoteRes.body) throw new Error("Cannot get file stream");

      // Upload to Bunny (using the AccessKey from Env)
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
        return new Response(`Upload Success! File: ${fileName} <br> <a href="/">Go Back</a>`, { headers: { "content-type": "text/html" } });
      } else {
        return new Response(`Upload Failed: ${await uploadRes.text()}`, { status: 500 });
      }

    } catch (err) {
      return new Response(`Internal Server Error: ${err.message}`, { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
