const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

async function generate() {
  const icon192Svg = path.join(__dirname, "../public/icons/icon-192.svg");
  const icon512Svg = path.join(__dirname, "../public/icons/icon-512.svg");
  const icon192Png = path.join(__dirname, "../public/icons/icon-192.png");
  const icon512Png = path.join(__dirname, "../public/icons/icon-512.png");

  await sharp(icon192Svg)
    .resize(192, 192)
    .png()
    .toFile(icon192Png);
  console.log("Generated icon-192.png");

  await sharp(icon512Svg)
    .resize(512, 512)
    .png()
    .toFile(icon512Png);
  console.log("Generated icon-512.png");
}

generate().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
