import { getStore } from "@netlify/blobs";
import QRCode from "qrcode";

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
    const data = await transferStore.get(code);

    if (!data) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build the download URL from the request
    const url = new URL(req.url);
    const downloadUrl = `${url.protocol}//${url.host}/?code=${code}`;

    const qrDataUrl = await QRCode.toDataURL(downloadUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      },
      errorCorrectionLevel: "M"
    });

    return new Response(JSON.stringify({ qr: qrDataUrl, url: downloadUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("QR error:", err);
    return new Response(JSON.stringify({ error: "Failed to generate QR code" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/qr/:code"
};
