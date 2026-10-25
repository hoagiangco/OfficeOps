<#
.SYNOPSIS
  Script sao lưu cơ sở dữ liệu PostgreSQL cho OfficeOps định kỳ.
.DESCRIPTION
  - Đọc cấu hình thư mục lưu trữ (BACKUP_DIR) từ file .env hoặc tham số truyền vào
  - Sử dụng pg_dump để kết xuất database sang thư mục sao lưu được chỉ định
  - Tự động xóa các bản sao lưu cũ hơn RetentionDays ngày (cấu hình trong .env: BACKUP_RETENTION_DAYS)
#>

param(
    [string]$BackupDir = "",
    [int]$RetentionDays = 0,
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

# 1. Đọc cấu hình từ .env
$envFile = Join-Path $PSScriptRoot "..\.env"
$backupDirFromEnv = $null
$retentionFromEnv = $null

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line.StartsWith("#") -or [string]::IsNullOrWhiteSpace($line)) {
            return
        }
        # Đọc thông tin kết nối Database
        if ($line -match '^DATABASE_URL\s*=\s*"(?:postgresql|postgres):\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)') {
            $DbUser = $matches[1]
            $env:PGPASSWORD = $matches[2]
            $HostName = $matches[3]
            $Port = [int]$matches[4]
            $DbName = $matches[5]
        }
        # Đọc đường dẫn thư mục backup từ .env (BACKUP_DIR)
        if ($line -like "BACKUP_DIR=*") {
            $val = $line.Substring(11).Trim().Trim('"').Trim([char]39)
            if (![string]::IsNullOrWhiteSpace($val)) {
                $backupDirFromEnv = $val
            }
        }
        # Đọc số ngày lưu trữ từ .env (BACKUP_RETENTION_DAYS)
        if ($line -like "BACKUP_RETENTION_DAYS=*") {
            $val = $line.Substring(22).Trim().Trim('"').Trim([char]39)
            if ($val -match '^\d+$') {
                $retentionFromEnv = [int]$val
            }
        }
    }
}

# 2. Xác định thư mục backup
if (-not $PSBoundParameters.ContainsKey('BackupDir') -or [string]::IsNullOrWhiteSpace($BackupDir)) {
    if (![string]::IsNullOrWhiteSpace($backupDirFromEnv)) {
        $BackupDir = $backupDirFromEnv
        $backupDirSource = ".env (BACKUP_DIR)"
    } else {
        $BackupDir = "E:\Backup\officeops"
        $backupDirSource = "Mặc định hệ thống"
    }
} else {
    $backupDirSource = "Tham số dòng lệnh (-BackupDir)"
}

# Chuẩn hóa đường dẫn (nếu là đường dẫn tương đối thì quy về thư mục gốc dự án)
if (-not [System.IO.Path]::IsPathRooted($BackupDir)) {
    $projectRoot = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
    $BackupDir = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $BackupDir))
}

# 3. Xác định số ngày lưu trữ
if (-not $PSBoundParameters.ContainsKey('RetentionDays') -or $RetentionDays -le 0) {
    if ($retentionFromEnv -and $retentionFromEnv -gt 0) {
        $RetentionDays = $retentionFromEnv
    } else {
        $RetentionDays = 14
    }
}

Write-Host "Thư mục lưu trữ: $BackupDir" -ForegroundColor Yellow
Write-Host "Cấu hình nguồn : $backupDirSource" -ForegroundColor Gray
Write-Host "Thời gian giữ  : $RetentionDays ngày" -ForegroundColor Gray
Write-Host "Kết nối DB     : $($HostName):$($Port) | Database: $DbName | User: $DbUser" -ForegroundColor Gray

# 4. Kiểm tra pg_dump
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

# 5. Tạo thư mục backup nếu chưa tồn tại
if (-not (Test-Path $BackupDir)) {
    Write-Host "Đang tạo thư mục lưu trữ: $BackupDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$outputFile = Join-Path $BackupDir "officeops-$timestamp.sql"
Write-Host "File sao lưu   : $outputFile" -ForegroundColor Gray

# 6. Thực thi pg_dump
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

# 7. Dọn dẹp bản backup cũ hơn $RetentionDays ngày
$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
$oldFiles = Get-ChildItem -Path $BackupDir -Filter "officeops-*.sql" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cutoffDate }

if ($oldFiles) {
    Write-Host "Xóa các bản sao lưu cũ hơn $RetentionDays ngày:" -ForegroundColor Yellow
    foreach ($file in $oldFiles) {
        $fileDate = $file.LastWriteTime.ToString("yyyy-MM-dd")
        Write-Host "  - Xóa: $($file.Name) (Tạo ngày $fileDate)"
        Remove-Item $file.FullName -Force
    }
} else {
    Write-Host "Không có file backup cũ quá $RetentionDays ngày cần dọn." -ForegroundColor Gray
}

Write-Host "Hoàn tất sao lưu." -ForegroundColor Green
