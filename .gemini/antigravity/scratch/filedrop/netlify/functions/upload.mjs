import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: "No files uploaded" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const transferStore = getStore("transfers");
    const fileStore = getStore("files");

    // Generate unique 6-char code
    let code;
    let attempts = 0;
    do {
      code = crypto.randomBytes(3).toString("hex").toUpperCase();
      const existing = await transferStore.get(code);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const fileInfos = [];

    for (const file of files) {
      const fileId = crypto.randomBytes(16).toString("hex");
      const buffer = await file.arrayBuffer();

      // Store raw binary — zero compression, zero transformation
      await fileStore.set(fileId, new Uint8Array(buffer));

      fileInfos.push({
        id: fileId,
        name: file.name,
        size: buffer.byteLength,
        type: file.type || "application/octet-stream"
      });
    }

    const transferData = {
      files: fileInfos,
      createdAt: Date.now()
    };

    await transferStore.setJSON(code, transferData);

    const reqUrl = new URL(req.url);
    const downloadUrl = `${reqUrl.protocol}//${reqUrl.host}/?code=${code}`;

    return new Response(JSON.stringify({
      code,
      fileCount: fileInfos.length,
      files: fileInfos.map(f => ({ name: f.name, size: f.size, mimetype: f.type })),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      downloadUrl
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Upload error:", err);
    return new Response(JSON.stringify({ error: "Upload failed: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/upload"
};
