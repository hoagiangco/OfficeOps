<#
.SYNOPSIS
  Script sao lưu cơ sở dữ liệu PostgreSQL cho OfficeOps định kỳ.
.DESCRIPTION
  - Sử dụng pg_dump để kết xuất database sang thư mục E:\Backup\officeops
  - Tự động xóa các bản sao lưu cũ hơn 14 ngày
  - Đọc cấu hình từ .env hoặc tham số truyền vào
#>

param(
    [string]$BackupDir = "E:\Backup\officeops",
    [int]$RetentionDays = 14,
    [string]$PgDumpPath = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
    [string]$HostName = "127.0.0.1",
    [int]$Port = 5432,
    [string]$DbUser = "postgres",
    [string]$DbName = "officeops"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dateStr = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "[$dateStr] Bắt đầu quá trình sao lưu Database OfficeOps..." -ForegroundColor Cyan

# 1. Kiểm tra pg_dump
if (-not (Test-Path $PgDumpPath)) {
    # Thử tìm trong PATH
    $cmd = Get-Command "pg_dump.exe" -ErrorAction SilentlyContinue
    if ($cmd) {
        $PgDumpPath = $cmd.Source
    } else {
        Write-Error "Không tìm thấy pg_dump.exe tại: $PgDumpPath"
        exit 1
    }
}

# 2. Tạo thư mục backup nếu chưa có
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$outputFile = Join-Path $BackupDir "officeops-$timestamp.sql"

# 3. Đọc mật khẩu từ .env nếu có
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^DATABASE_URL\s*=\s*"(?:postgresql|postgres):\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)') {
            $DbUser = $matches[1]
            $env:PGPASSWORD = $matches[2]
            $HostName = $matches[3]
            $Port = [int]$matches[4]
            $DbName = $matches[5]
        }
    }
}

Write-Host "Kết nối tới: ${HostName}:${Port} | Database: $DbName | User: $DbUser" -ForegroundColor Gray
Write-Host "File sao lưu: $outputFile" -ForegroundColor Gray

# 4. Thực thi pg_dump
try {
    $proc = Start-Process -FilePath $PgDumpPath -ArgumentList "-h $HostName -p $Port -U $DbUser -d $DbName -F p -b -v -f `"$outputFile`"" -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -eq 0 -and (Test-Path $outputFile)) {
        $fileSize = (Get-Item $outputFile).Length
        $sizeKB = [math]::Round($fileSize / 1KB, 2)
        Write-Host "[$dateStr] Sao lưu thành công! Kích thước file: $sizeKB KB" -ForegroundColor Green
    } else {
        Write-Error "pg_dump hoàn thành với lỗi (Exit code: $($proc.ExitCode))."
        exit 1
    }
} catch {
    Write-Error "Lỗi trong quá trình thực thi pg_dump: $_"
    exit 1
}

# 5. Dọn dẹp bản backup cũ hơn $RetentionDays ngày
$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
$oldFiles = Get-ChildItem -Path $BackupDir -Filter "officeops-*.sql" | Where-Object { $_.LastWriteTime -lt $cutoffDate }

if ($oldFiles) {
    Write-Host "Xóa các bản sao lưu cũ hơn $RetentionDays ngày:" -ForegroundColor Yellow
    foreach ($file in $oldFiles) {
        Write-Host "  - Xóa: $($file.Name) (Tạo ngày $($file.LastWriteTime.ToString('yyyy-MM-dd')))"
        Remove-Item $file.FullName -Force
    }
} else {
    Write-Host "Không có file backup cũ quá $RetentionDays ngày cần dọn." -ForegroundColor Gray
}

Write-Host "Hoàn tất sao lưu." -ForegroundColor Green
