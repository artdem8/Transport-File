const QRCode = require('qrcode');

async function test() {
  try {
    const qrDataUrl = await QRCode.toDataURL("http://192.168.0.128:3000/?code=ABCDEF", {
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
    console.log("Success:", qrDataUrl.substring(0, 50) + "...");
  } catch (err) {
    console.error("Error generating QR:", err);
  }
}

test();
