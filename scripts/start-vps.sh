#!/bin/bash
# ==============================================================================
# SCRIPT TRIEN KHAI & KHOI DONG OFFICEOPS TREN LINUX VPS
# ==============================================================================

set -e

echo "=========================================="
echo ">> [OfficeOps] Dang bat dau khoi chay tren Linux VPS..."
echo "=========================================="

# 1. Kiem tra cau hinh .env
if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    echo ">> Chua co .env, tien hanh sao chep tu .env.production..."
    cp .env.production .env
  elif [ -f .env.production.example ]; then
    echo ">> Chua co .env, sao chep tu .env.production.example..."
    cp .env.production.example .env
    echo ">> [LUU Y]: Vui long cap nhat thong tin trong file .env truoc khi chay!"
  fi
fi

# 2. Tao thu muc upload neu chua co
mkdir -p public/uploads

# 3. Kiem tra thu vien xu ly anh Sharp cho Linux
echo ">> [1/3] Kiem tra thu vien xu ly anh Sharp..."
node -e "try { require('sharp'); console.log('>> [Sharp]: Hoat dong tot tren Linux runtime!'); } catch(e) { console.warn('>> [Sharp Warning]:', e.message); console.log('>> Dang cai dat Sharp cho Linux...'); require('child_process').execSync('npm install --os=linux --cpu=x64 sharp', { stdio: 'inherit' }); }" || true

# 4. Dong bo Prisma Client & Migrate DB tren Linux
if [ -d "./prisma" ]; then
  echo ">> [2/3] Tao Prisma Client va chay migrate database..."
  npx prisma generate || true
  npx prisma migrate deploy || echo ">> Bo qua migrate neu database da duoc dong bo."
fi

# 5. Khoi dong ung dung bang PM2
echo ">> [3/3] Khoi dong ung dung OfficeOps..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
  pm2 save
  echo ">> Trien khai hoan tat tren cong 3003!"
  pm2 status officeops
  echo ">> Xem log ung dung: pm2 logs officeops"
else
  echo ">> PM2 chua duoc cai dat. Khoi dong truc tiep voi Node.js..."
  node server.js
fi
