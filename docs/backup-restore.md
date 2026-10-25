# HƯỚNG DẪN SAO LƯU & PHỤC HỒI CƠ SỞ DỮ LIỆU OFFICEOPS

Tài liệu này hướng dẫn quy trình vận hành sao lưu (backup) và phục hồi (restore) cơ sở dữ liệu PostgreSQL cho hệ thống OfficeOps.

---

## 1. Cơ chế Sao lưu (Backup)

- **Script thực thi:** `scripts/backup-db.ps1`
- **Công cụ:** `pg_dump` của PostgreSQL
- **Tùy chỉnh thư mục lưu trữ qua `.env`:**
  Người quản trị có thể thay đổi đường dẫn lưu trữ bất cứ lúc nào trong file `.env`:
  ```ini
  # Thư mục lưu trữ file sao lưu (tùy chỉnh theo ổ đĩa mong muốn)
  BACKUP_DIR="E:\Backup\officeops"
  # Số ngày lưu trữ trước khi tự động dọn dẹp file cũ
  BACKUP_RETENTION_DAYS="14"
  ```
- **Quy tắc đặt tên file:** `officeops-YYYYMMDD_HHmmss.sql`
- **Chính sách lưu trữ (Retention Policy):** Mặc định giữ bản sao lưu trong 14 ngày (hoặc theo cấu hình `BACKUP_RETENTION_DAYS`). Script tự động xóa các file `.sql` cũ khi chạy.

### 1.1 Chạy sao lưu thủ công bằng PowerShell
```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
```

### 1.2 Đặt lịch tự động bằng Windows Task Scheduler (02:00 sáng hằng ngày)
Chạy lệnh PowerShell (với quyền Administrator) để đăng ký tác vụ:
```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"E:\Web Project\OfficeOps\scripts\backup-db.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
Register-ScheduledTask -TaskName "OfficeOps_Daily_Database_Backup" -Action $action -Trigger $trigger -Description "Sao lưu database PostgreSQL hằng ngày cho OfficeOps" -User "SYSTEM"
```

---

## 2. Quy trình Phục hồi dữ liệu (Restore)

### 2.1 Chuẩn bị trước khi Restore
1. Xác định file sao lưu cần phục hồi từ thư mục `E:\Backup\officeops\`.
2. Kiểm tra dịch vụ PostgreSQL đang chạy:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5432
```

### 2.2 Phục hồi đè lên database hiện tại (`officeops`)
> [!CAUTION]
> Thao tác này sẽ ghi đè toàn bộ dữ liệu hiện có trong database `officeops`. Đảm bảo đã chạy backup bản hiện tại trước khi thực hiện.

```powershell
$env:PGPASSWORD = "your_postgres_password"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$backupFile = "E:\Backup\officeops\officeops-20261025_113923.sql"

# Ngắt các kết nối đang hoạt động tới DB (nếu cần) và xóa/tạo lại DB
& $psql -h 127.0.0.1 -p 5432 -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'officeops' AND pid <> pg_backend_pid();"
& $psql -h 127.0.0.1 -p 5432 -U postgres -c "DROP DATABASE IF EXISTS officeops;"
& $psql -h 127.0.0.1 -p 5432 -U postgres -c "CREATE DATABASE officeops OWNER postgres;"

# Phục hồi dữ liệu từ file backup
& $psql -h 127.0.0.1 -p 5432 -U postgres -d officeops -f $backupFile
```

### 2.3 Phục hồi thử nghiệm vào database tạm (`officeops_test_restore`)
Để kiểm tra tính toàn vẹn của file backup mà không ảnh hưởng tới hệ thống đang chạy:
```powershell
$env:PGPASSWORD = "your_postgres_password"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$backupFile = "E:\Backup\officeops\officeops-20261025_113923.sql"

# 1. Tạo database tạm
& $psql -h 127.0.0.1 -p 5432 -U postgres -c "DROP DATABASE IF EXISTS officeops_test_restore;"
& $psql -h 127.0.0.1 -p 5432 -U postgres -c "CREATE DATABASE officeops_test_restore OWNER postgres;"

# 2. Phục hồi dữ liệu
& $psql -h 127.0.0.1 -p 5432 -U postgres -d officeops_test_restore -f $backupFile

# 3. Đối chiếu số lượng bản ghi giữa 2 database
& $psql -h 127.0.0.1 -p 5432 -U postgres -d officeops_test_restore -c "SELECT 'User' as tbl, count(*) FROM \"User\" UNION ALL SELECT 'Equipment', count(*) FROM \"Equipment\" UNION ALL SELECT 'Ticket', count(*) FROM \"Ticket\";"
```

---

## 3. Nhật ký kiểm tra định kỳ
- Hằng tuần: Kiểm tra thư mục `E:\Backup\officeops` xem các file `.sql` có được sinh ra liên tục hằng ngày lúc 02:00 hay không.
- Hằng tháng: Thực hiện restore thử nghiệm vào database tạm theo mục 2.3 để kiểm tra độ tin cậy của file sao lưu.
