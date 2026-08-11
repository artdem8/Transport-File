const fs = require('fs');

async function test() {
  const formData = new FormData();
  formData.append('files', new Blob(['Hello World']), 'test.txt');

  try {
    const res = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    console.log("Upload:", data);

    const qrRes = await fetch(`http://localhost:3000/api/qr/${data.code}`);
    const qrData = await qrRes.json();
    console.log("QR:", qrData);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
