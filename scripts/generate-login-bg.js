const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const imgDir = path.resolve(__dirname, "..", "public", "images");
if (!fs.existsSync(imgDir)) {
  fs.mkdirSync(imgDir, { recursive: true });
}

const svg = `
<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="35%" stop-color="#0f172a"/>
      <stop offset="70%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0b1120"/>
    </linearGradient>
    <radialGradient id="glow1" cx="15%" cy="25%" r="50%">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="85%" cy="80%" r="55%">
      <stop offset="0%" stop-color="#0d9488" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0d9488" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow3" cx="50%" cy="50%" r="40%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#334155" stroke-width="0.8" stroke-opacity="0.25"/>
      <circle cx="48" cy="48" r="1.2" fill="#60a5fa" fill-opacity="0.35"/>
    </pattern>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <rect width="1920" height="1080" fill="url(#grid)"/>
  <rect width="1920" height="1080" fill="url(#glow1)"/>
  <rect width="1920" height="1080" fill="url(#glow2)"/>
  <rect width="1920" height="1080" fill="url(#glow3)"/>
</svg>
`;

const outputPath = path.join(imgDir, "tech_login_bg.png");

sharp(Buffer.from(svg))
  .png({ quality: 90 })
  .toFile(outputPath)
  .then((info) => {
    console.log(">> Đã tạo thành công:", outputPath, `(${info.width}x${info.height}, ${(info.size/1024).toFixed(1)} KB)`);
  })
  .catch((err) => {
    console.error("Lỗi khi tạo ảnh:", err);
    process.exit(1);
  });
