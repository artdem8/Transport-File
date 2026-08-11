import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const code = context.params.code?.toUpperCase();

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

    return new Response(JSON.stringify({
      code,
      fileCount: data.files.length,
      files: data.files.map(f => ({ name: f.name, size: f.size, mimetype: f.type })),
      createdAt: new Date(data.createdAt).toISOString(),
      expiresAt: new Date(data.createdAt + 24 * 60 * 60 * 1000).toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Info error:", err);
    return new Response(JSON.stringify({ error: "Failed to retrieve transfer info" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/info/:code"
};
