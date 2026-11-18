/**
 * Tự động chuẩn bị và nạp thư viện Sharp Native Binaries cho môi trường Linux x64 (VPS)
 * Giúp Next.js Standalone build trên Windows có thể chạy trơn tru trên Linux VPS
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(__dirname, "cache", "sharp-linux");

const SHARP_LINUX_PACKAGES = [
  {
    spec: "@img/sharp-linux-x64@0.35.5",
    dirName: "sharp-linux-x64",
    tarName: "img-sharp-linux-x64-0.35.5.tgz",
  },
  {
    spec: "@img/sharp-libvips-linux-x64@1.3.4",
    dirName: "sharp-libvips-linux-x64",
    tarName: "img-sharp-libvips-linux-x64-1.3.4.tgz",
  },
];

function ensureLinuxSharp(stagingNodeModulesDir) {
  console.log("\n>> [Sharp Linux] Đang chuẩn bị thư viện Sharp native cho môi trường Linux VPS...");

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  for (const pkg of SHARP_LINUX_PACKAGES) {
    const pkgTargetDir = path.join(CACHE_DIR, pkg.dirName);
    const isCached =
      fs.existsSync(pkgTargetDir) &&
      fs.existsSync(path.join(pkgTargetDir, "package.json"));

    if (!isCached) {
      console.log(`>> [Sharp Linux] Đang tải gói native Linux: ${pkg.spec}...`);
      try {
        execSync(`npm pack ${pkg.spec}`, {
          cwd: CACHE_DIR,
          stdio: "ignore",
        });

        // Tìm file .tgz vừa tải
        const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".tgz"));
        const tgzFile = files.find((f) => f.includes(pkg.dirName)) || files[0];

        if (tgzFile) {
          fs.mkdirSync(pkgTargetDir, { recursive: true });
          const tgzPath = path.join(CACHE_DIR, tgzFile);
          execSync(`tar -xzf "${tgzPath}" --strip-components=1 -C "${pkgTargetDir}"`, {
            stdio: "ignore",
          });
          fs.unlinkSync(tgzPath);
          console.log(`>> [Sharp Linux] Đã giải nén thành công ${pkg.dirName}`);
        }
      } catch (err) {
        console.warn(`>> [Sharp Linux Cảnh báo]: Không thể tải trước ${pkg.spec}:`, err.message);
      }
    } else {
      console.log(`>> [Sharp Linux] Đã có sẵn cache cho ${pkg.dirName}`);
    }

    // Sao chép vào staging node_modules/@img/
    const destImgDir = path.join(stagingNodeModulesDir, "@img", pkg.dirName);
    if (fs.existsSync(pkgTargetDir)) {
      fs.mkdirSync(path.dirname(destImgDir), { recursive: true });
      fs.cpSync(pkgTargetDir, destImgDir, { recursive: true });
      console.log(`>> [Sharp Linux] Đã tích hợp @img/${pkg.dirName} vào gói standalone!`);
    }
  }

  // Đảm bảo module sharp gốc có mặt đầy đủ trong staging
  const rootSharpDir = path.join(ROOT_DIR, "node_modules", "sharp");
  const destSharpDir = path.join(stagingNodeModulesDir, "sharp");
  if (fs.existsSync(rootSharpDir) && !fs.existsSync(destSharpDir)) {
    fs.cpSync(rootSharpDir, destSharpDir, { recursive: true });
    console.log(">> [Sharp Linux] Đã sao chép module sharp vào staging.");
  }
}

module.exports = {
  ensureLinuxSharp,
};

if (require.main === module) {
  const testStaging = path.join(ROOT_DIR, "deploy", "test-sharp-modules");
  ensureLinuxSharp(testStaging);
  console.log("Hoàn thành kiểm tra Sharp Linux!");
}
