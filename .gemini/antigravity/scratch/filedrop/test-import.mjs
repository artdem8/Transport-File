import QRCode from "qrcode";

async function test() {
  try {
    const qrDataUrl = await QRCode.toDataURL("http://example.com", {
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
    console.log("Success");
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
