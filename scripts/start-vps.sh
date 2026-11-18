#!/bin/bash
# ==============================================================================
# SCRIPT TRIỂN KHAI & KHỞI ĐỘNG OFFICEOPS TRÊN LINUX VPS
# ==============================================================================

set -e

echo "=========================================="
echo ">> [OfficeOps] Đang bắt đầu triển khai..."
echo "=========================================="

# 1. Kiểm tra cấu hình .env
if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    echo ">> Chưa có .env, tiến hành sao chép từ .env.production..."
    cp .env.production .env
  elif [ -f .env.production.example ]; then
    echo ">> Chưa có .env, sao chép từ .env.production.example..."
    cp .env.production.example .env
    echo ">> [LƯU Ý]: Vui lòng cập nhật thông tin trong file .env trước khi chạy!"
  fi
fi

# 2. Tạo thư mục tải lên nếu chưa có
mkdir -p public/uploads

# 3. Đồng bộ cơ sở dữ liệu Prisma nếu có migrations
if [ -d "./prisma" ]; then
  echo ">> Đang kiểm tra và áp dụng cập nhật Database (Prisma Migrate)..."
  npx prisma migrate deploy || echo ">> Bỏ qua bước migrate nếu database đã cập nhật."
fi

# 4. Khởi động / Khởi động lại ứng dụng
if command -v pm2 >/dev/null 2>&1; then
  echo ">> Đang khởi động bằng PM2..."
  pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
  pm2 save
  echo ">> Triển khai hoàn tất! Trạng thái tiến trình:"
  pm2 status officeops
  echo ">> Xem log ứng dụng: pm2 logs officeops"
else
  echo ">> PM2 chưa được cài đặt. Khởi động trực tiếp với Node.js..."
  node server.js
fi
