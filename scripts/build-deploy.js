/**
 * Script tự động Build Standalone & Đóng gói Zip triển khai VPS cho OfficeOps
 * Cách chạy:
 *   node scripts/build-deploy.js
 *   hoặc: npm run deploy:build
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { ensureLinuxSharp } = require("./prepare-linux-sharp");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEPLOY_DIR = path.join(ROOT_DIR, "deploy");
const STAGING_DIR = path.join(DEPLOY_DIR, "staging");

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}-${MM}-${dd}_${HH}-${mm}-${ss}`;
}

function run(command, cwd = ROOT_DIR) {
  console.log(`\n>> Đang chạy: ${command}`);
  execSync(command, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
  });
}

async function main() {
  const startTime = Date.now();
  const timestamp = getTimestamp();
  const zipFileName = `officeops-standalone-${timestamp}.zip`;
  const zipFilePath = path.join(DEPLOY_DIR, zipFileName);

  console.log("==================================================");
  console.log("   OFFICEOPS - BUILD STANDALONE & ĐÓNG GÓI VPS    ");
  console.log(`   Thời gian tạo: ${timestamp}`);
  console.log("==================================================");

  // 1. Đảm bảo thư mục deploy tồn tại
  if (!fs.existsSync(DEPLOY_DIR)) {
    fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  }

  // 2. Dọn dẹp staging cũ nếu có
  if (fs.existsSync(STAGING_DIR)) {
    console.log(">> Dọn dẹp thư mục staging cũ...");
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  // 3. Tiến hành build Next.js (Standalone)
  console.log("\n>> [1/5] Đang build ứng dụng Next.js (standalone)...");
  try {
    run("npm run build");
  } catch (err) {
    console.log(">> Phát hiện thông báo khuyến nghị nâng cấp Next.js, tự động retry tiếp tục build...");
    run("npm run build");
  }

  const standaloneDir = path.join(ROOT_DIR, ".next", "standalone");
  if (!fs.existsSync(standaloneDir)) {
    throw new Error("Lỗi: Không tìm thấy thư mục .next/standalone! Kiểm tra output: 'standalone' trong next.config.ts");
  }

  // 4. Sao chép các tệp từ .next/standalone sang staging
  console.log("\n>> [2/5] Đang tập hợp các tệp lõi standalone vào staging...");
  fs.cpSync(standaloneDir, STAGING_DIR, { recursive: true });

  // 4.1 Bổ sung Sharp Native Binaries cho Linux VPS (x64)
  const stagingNodeModules = path.join(STAGING_DIR, "node_modules");
  ensureLinuxSharp(stagingNodeModules);

  // 5. Sao chép tài nguyên tĩnh (.next/static và public)
  console.log("\n>> [3/5] Đang bổ sung static assets (.next/static) và thư mục public...");
  const staticSrc = path.join(ROOT_DIR, ".next", "static");
  const staticDest = path.join(STAGING_DIR, ".next", "static");
  if (fs.existsSync(staticSrc)) {
    fs.mkdirSync(path.dirname(staticDest), { recursive: true });
    fs.cpSync(staticSrc, staticDest, { recursive: true });
  }

  const publicSrc = path.join(ROOT_DIR, "public");
  const publicDest = path.join(STAGING_DIR, "public");
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
  }

  // 6. Sao chép Prisma (schema và migrations)
  console.log("\n>> [4/5] Đang bổ sung schema và migrations cơ sở dữ liệu Prisma...");
  const prismaSrc = path.join(ROOT_DIR, "prisma");
  const prismaDest = path.join(STAGING_DIR, "prisma");
  if (fs.existsSync(prismaSrc)) {
    fs.mkdirSync(prismaDest, { recursive: true });
    if (fs.existsSync(path.join(prismaSrc, "schema.prisma"))) {
      fs.copyFileSync(
        path.join(prismaSrc, "schema.prisma"),
        path.join(prismaDest, "schema.prisma")
      );
    }
    const migrationsSrc = path.join(prismaSrc, "migrations");
    if (fs.existsSync(migrationsSrc)) {
      fs.cpSync(migrationsSrc, path.join(prismaDest, "migrations"), { recursive: true });
    }
  }

  // Cấu hình PM2 ecosystem, file khởi động và hướng dẫn
  const ecosystemSrc = path.join(ROOT_DIR, "ecosystem.config.js");
  if (fs.existsSync(ecosystemSrc)) {
    fs.copyFileSync(ecosystemSrc, path.join(STAGING_DIR, "ecosystem.config.js"));
  }

  const startVpsSrc = path.join(ROOT_DIR, "scripts", "start-vps.sh");
  if (fs.existsSync(startVpsSrc)) {
    fs.copyFileSync(startVpsSrc, path.join(STAGING_DIR, "start.sh"));
  }

  const guideSrc = path.join(DEPLOY_DIR, "HUONG_DAN_DEPLOY_VPS.md");
  if (fs.existsSync(guideSrc)) {
    fs.copyFileSync(guideSrc, path.join(STAGING_DIR, "README.md"));
  }

  // Sao chép mẫu cấu hình môi trường (.env.production hoặc .env.production.example)
  const envProdSrc = path.join(ROOT_DIR, ".env.production");
  const envExampleSrc = path.join(ROOT_DIR, ".env.production.example");
  if (fs.existsSync(envProdSrc)) {
    fs.copyFileSync(envProdSrc, path.join(STAGING_DIR, ".env"));
    fs.copyFileSync(envProdSrc, path.join(STAGING_DIR, ".env.production"));
  }
  if (fs.existsSync(envExampleSrc)) {
    fs.copyFileSync(envExampleSrc, path.join(STAGING_DIR, ".env.production.example"));
  }

  // Điều chỉnh package.json trong staging để start đúng server.js
  const stagingPkgPath = path.join(STAGING_DIR, "package.json");
  if (fs.existsSync(stagingPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(stagingPkgPath, "utf-8"));
      pkg.scripts = {
        ...pkg.scripts,
        start: "node server.js",
      };
      fs.writeFileSync(stagingPkgPath, JSON.stringify(pkg, null, 2), "utf-8");
    } catch (e) {
      // Bỏ qua nếu không parse được
    }
  }

  // 7. Tạo file nén zip
  console.log(`\n>> [5/5] Đang nén toàn bộ thành file zip: ${zipFileName}...`);
  try {
    // Ưu tiên dùng lệnh tar có sẵn trên Windows 10/11 & Linux
    execSync(`tar -a -c -f "${zipFilePath}" *`, {
      cwd: STAGING_DIR,
      stdio: "ignore",
    });
  } catch (err) {
    console.log(">> tar không khả dụng, sử dụng PowerShell Compress-Archive...");
    execSync(
      `powershell -Command "Compress-Archive -Path '${STAGING_DIR}\\*' -DestinationPath '${zipFilePath}' -Force"`,
      { stdio: "inherit" }
    );
  }

  // 8. Dọn dẹp thư mục staging tạm
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });

  const stats = fs.statSync(zipFilePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n==================================================");
  console.log("             TRIỂN KHAI HOÀN TẤT!                 ");
  console.log("==================================================");
  console.log(`- File zip:     ${zipFileName}`);
  console.log(`- Dung lượng:   ${sizeMB} MB`);
  console.log(`- Vị trí:       ${zipFilePath}`);
  console.log(`- Thời gian:    ${duration} giây`);
  console.log("--------------------------------------------------");
  console.log("Bước tiếp theo:");
  console.log("1. Tải file zip lên VPS (VD: /var/www/officeops).");
  console.log("2. Giải nén: unzip -o <ten_file>.zip");
  console.log("3. Kiểm tra file .env");
  console.log("4. Chạy: chmod +x start.sh && ./start.sh");
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("\n[LỖI TRIỂN KHAI]:", err.message || err);
  process.exit(1);
});
