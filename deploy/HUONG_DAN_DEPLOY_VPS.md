# HƯỚNG DẪN TRIỂN KHAI OFFICEOPS LÊN VPS (UBUNTU / DEBIAN / LINUX)

## 1. Yêu cầu trên VPS
- **Node.js**: Phiên bản 20.x hoặc 24.x (Khuyến nghị dùng Node 24).
- **PostgreSQL**: Phiên bản 14 trở lên.
- **PM2**: Trình quản lý tiến trình Node.js:
  ```bash
  npm install -g pm2
  ```
- **Nginx** (Tùy chọn): Làm Reverse Proxy trỏ domain về cổng 5000 và cài SSL (Certbot).

---

## 2. Các bước triển khai bằng file Zip Standalone

### Bước 1: Tải file Zip lên VPS
File zip được sinh tự động tại thư mục `deploy/` trên máy local (ví dụ: `officeops-standalone-2026-11-18_09-55-00.zip`).
Dùng SCP hoặc FileZilla / WinSCP để tải lên VPS:
```bash
scp deploy/officeops-standalone-*.zip user@your-vps-ip:/var/www/
```

### Bước 2: Giải nén trên VPS
```bash
# Tạo thư mục chạy ứng dụng nếu chưa có
mkdir -p /var/www/officeops
cd /var/www/officeops

# Giải nén đè lên thư mục hiện tại
unzip -o /var/www/officeops-standalone-*.zip -d /var/www/officeops/
```

### Bước 3: Cấu hình biến môi trường (.env)
Nếu là lần đầu triển khai, kiểm tra và chỉnh sửa file `.env`:
```bash
nano .env
```
Các thông số bắt buộc cần kiểm tra:
- `DATABASE_URL`: Kết nối đúng user/password và database PostgreSQL trên VPS.
- `NEXT_PUBLIC_APP_URL`: Domain hoặc IP của VPS (ví dụ: `https://officeops.company.vn`).
- `AUTH_SECRET`: Khóa bí mật (đã được tạo ngẫu nhiên sẵn).
- `SMTP_*`: Thông tin gửi mail.

### Bước 4: Cấp quyền thực thi và khởi động
```bash
chmod +x start.sh
./start.sh
```

---

## 3. Quản lý ứng dụng với PM2

- **Xem trạng thái**: `pm2 status`
- **Xem log thời gian thực**: `pm2 logs officeops`
- **Khởi động lại**: `pm2 restart officeops`
- **Dừng ứng dụng**: `pm2 stop officeops`
- **Cấu hình tự khởi động lại khi reboot VPS**:
  ```bash
  pm2 startup
  pm2 save
  ```

---

## 4. Mẫu cấu hình Nginx Reverse Proxy (Cổng 80/443 -> Cổng 5000)

File cấu hình `/etc/nginx/sites-available/officeops`:
```nginx
server {
    server_name officeops.yourcompany.vn;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 50M;
}
```
Kích hoạt và cài SSL Let's Encrypt:
```bash
sudo ln -s /etc/nginx/sites-available/officeops /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d officeops.yourcompany.vn
```
