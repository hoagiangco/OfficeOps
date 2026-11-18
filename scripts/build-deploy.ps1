# ==============================================================================
# Script PowerShell tự động Build Standalone & Đóng gói Zip cho VPS
# Chạy trực tiếp: .\scripts\build-deploy.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$DeployDir = Join-Path $RootDir "deploy"
$StagingDir = Join-Path $DeployDir "staging"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$ZipFileName = "officeops-standalone-$Timestamp.zip"
$ZipFilePath = Join-Path $DeployDir $ZipFileName

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   OFFICEOPS - BUILD STANDALONE & DONG GOI VPS    " -ForegroundColor Cyan
Write-Host "   Thoi gian tao: $Timestamp" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Dam bao thu muc deploy ton tai
if (-not (Test-Path $DeployDir)) {
    New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null
}

# 2. Don dep staging cu
if (Test-Path $StagingDir) {
    Remove-Item -Recurse -Force $StagingDir
}
New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

# 3. Chay Next.js Build
Write-Host "`n>> [1/5] Dang build ung dung Next.js (standalone)..." -ForegroundColor Yellow
Set-Location $RootDir
try {
    npm run build
} catch {
    Write-Host ">> Phat hien thong bao khuyen nghi nang cap Next.js, tu dong retry tiep tuc build..." -ForegroundColor Yellow
    npm run build
}

$StandaloneDir = Join-Path $RootDir ".next\standalone"
if (-not (Test-Path $StandaloneDir)) {
    Write-Error "Loi: Khong tim thay thu muc .next/standalone! Kiem tra output: 'standalone' trong next.config.ts"
}

# 4. Sao chep standalone vao staging
Write-Host "`n>> [2/5] Dang tap hop cac tep standalone vao staging..." -ForegroundColor Yellow
Copy-Item -Path "$StandaloneDir\*" -Destination $StagingDir -Recurse -Force

# 5. Bo sung static va public
Write-Host "`n>> [3/5] Dang bo sung static assets (.next/static) va public..." -ForegroundColor Yellow
$StaticSrc = Join-Path $RootDir ".next\static"
$StaticDest = Join-Path $StagingDir ".next\static"
if (Test-Path $StaticSrc) {
    if (-not (Test-Path (Split-Path $StaticDest))) {
        New-Item -ItemType Directory -Path (Split-Path $StaticDest) -Force | Out-Null
    }
    Copy-Item -Path $StaticSrc -Destination $StaticDest -Recurse -Force
}

$PublicSrc = Join-Path $RootDir "public"
$PublicDest = Join-Path $StagingDir "public"
if (Test-Path $PublicSrc) {
    Copy-Item -Path $PublicSrc -Destination $PublicDest -Recurse -Force
}

# 6. Bo sung Prisma, PM2 config, scripts, env
Write-Host "`n>> [4/5] Dang bo sung database schema, migrations va cau hinh VPS..." -ForegroundColor Yellow
$PrismaSrc = Join-Path $RootDir "prisma"
$PrismaDest = Join-Path $StagingDir "prisma"
if (Test-Path $PrismaSrc) {
    New-Item -ItemType Directory -Path $PrismaDest -Force | Out-Null
    if (Test-Path "$PrismaSrc\schema.prisma") {
        Copy-Item "$PrismaSrc\schema.prisma" "$PrismaDest\schema.prisma" -Force
    }
    if (Test-Path "$PrismaSrc\migrations") {
        Copy-Item "$PrismaSrc\migrations" "$PrismaDest\migrations" -Recurse -Force
    }
}

if (Test-Path "$RootDir\ecosystem.config.js") {
    Copy-Item "$RootDir\ecosystem.config.js" "$StagingDir\ecosystem.config.js" -Force
}
if (Test-Path "$RootDir\scripts\start-vps.sh") {
    Copy-Item "$RootDir\scripts\start-vps.sh" "$StagingDir\start.sh" -Force
}
if (Test-Path "$DeployDir\HUONG_DAN_DEPLOY_VPS.md") {
    Copy-Item "$DeployDir\HUONG_DAN_DEPLOY_VPS.md" "$StagingDir\README.md" -Force
}
if (Test-Path "$RootDir\.env.production") {
    Copy-Item "$RootDir\.env.production" "$StagingDir\.env" -Force
    Copy-Item "$RootDir\.env.production" "$StagingDir\.env.production" -Force
}
if (Test-Path "$RootDir\.env.production.example") {
    Copy-Item "$RootDir\.env.production.example" "$StagingDir\.env.production.example" -Force
}

# 7. Nen thanh file zip
Write-Host "`n>> [5/5] Dang nen toan bo thanh file zip: $ZipFileName..." -ForegroundColor Yellow
$TarCmd = Get-Command tar -ErrorAction SilentlyContinue
if ($TarCmd) {
    Push-Location $StagingDir
    tar -a -c -f $ZipFilePath *
    Pop-Location
} else {
    Compress-Archive -Path "$StagingDir\*" -DestinationPath $ZipFilePath -Force
}

# 8. Don dep staging
Remove-Item -Recurse -Force $StagingDir

$ZipSize = (Get-Item $ZipFilePath).Length / 1MB

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "             TRIEN KHAI HOAN TAT!                 " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "- File zip:     $ZipFileName" -ForegroundColor Cyan
Write-Host "- Dung luong:   $([math]::Round($ZipSize, 2)) MB" -ForegroundColor Cyan
Write-Host "- Vi tri:       $ZipFilePath" -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Green
