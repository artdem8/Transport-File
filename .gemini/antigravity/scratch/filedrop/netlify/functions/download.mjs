import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const code = context.params.code?.toUpperCase();
    const index = parseInt(context.params.index || "0", 10);

    if (!code) {
      return new Response(JSON.stringify({ error: "No code provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const transferStore = getStore("transfers");
    const data = await transferStore.get(code, { type: "json" });

    if (!data) {
      return new Response(JSON.stringify({ error: "Transfer not found or expired" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (index < 0 || index >= data.files.length) {
      return new Response(JSON.stringify({ error: "Invalid file index" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const fileInfo = data.files[index];
    const fileStore = getStore("files");

    // Retrieve raw binary — untouched, no re-encoding
    const fileData = await fileStore.get(fileInfo.id, { type: "arrayBuffer" });

    if (!fileData) {
      return new Response(JSON.stringify({ error: "File not found in storage" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(fileData, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileInfo.name)}"`,
        "Content-Length": String(fileData.byteLength),
        "Cache-Control": "no-cache"
      }
    });
  } catch (err) {
    console.error("Download error:", err);
    return new Response(JSON.stringify({ error: "Download failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/download/:code/:index"
};
