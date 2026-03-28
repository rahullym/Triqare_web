# =============================================
# Export Existing Supabase Database
# =============================================
# This script exports the current Supabase database schema and data
# to the sourcedb folder for backup and reference
#
# Usage: .\scripts\export-database.ps1

Write-Host "🗄️  Exporting Existing Supabase Database..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Create sourcedb directory if it doesn't exist
$sourceDbPath = "sourcedb"
if (-not (Test-Path $sourceDbPath)) {
    New-Item -ItemType Directory -Path $sourceDbPath | Out-Null
    Write-Host "✅ Created directory: $sourceDbPath" -ForegroundColor Green
}

# Load environment variables
$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Host "❌ Error: .env.local file not found!" -ForegroundColor Red
    exit 1
}

# Parse Supabase URL and credentials from .env.local
$supabaseUrl = (Get-Content $envFile | Select-String -Pattern "NEXT_PUBLIC_SUPABASE_URL=(.+)").Matches.Groups[1].Value
$serviceRoleKey = (Get-Content $envFile | Select-String -Pattern "SUPABASE_SERVICE_ROLE_KEY=(.+)").Matches.Groups[1].Value

if (-not $supabaseUrl) {
    Write-Host "❌ Error: NEXT_PUBLIC_SUPABASE_URL not found in .env.local" -ForegroundColor Red
    exit 1
}

# Extract project reference from URL
$projectRef = $supabaseUrl -replace "https://", "" -replace ".supabase.co", ""

Write-Host "📊 Database Details:" -ForegroundColor Yellow
Write-Host "   Project Ref: $projectRef" -ForegroundColor White
Write-Host "   URL: $supabaseUrl" -ForegroundColor White
Write-Host ""

# Supabase connection details
$dbHost = "db.$projectRef.supabase.co"
$dbPort = "5432"
$dbName = "postgres"
$dbUser = "postgres"

Write-Host "🔐 Database connection requires password" -ForegroundColor Yellow
Write-Host "   You can find your database password in:" -ForegroundColor White
Write-Host "   Supabase Dashboard → Settings → Database → Connection String" -ForegroundColor White
Write-Host ""
$dbPassword = Read-Host "Enter your Supabase database password" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword))

Write-Host ""
Write-Host "🔍 Checking if pg_dump is available..." -ForegroundColor Cyan

# Check if pg_dump is available
$pgDumpPath = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source

if (-not $pgDumpPath) {
    Write-Host "❌ pg_dump not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install PostgreSQL client tools:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host "2. Or install via Chocolatey: choco install postgresql" -ForegroundColor White
    Write-Host "3. Make sure pg_dump is in your PATH" -ForegroundColor White
    Write-Host ""
    Write-Host "Alternative: Use Supabase CLI method (see export-database-supabase-cli.ps1)" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ Found pg_dump at: $pgDumpPath" -ForegroundColor Green
Write-Host ""

# Set environment variable for password
$env:PGPASSWORD = $dbPasswordPlain

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

Write-Host "📥 Exporting database..." -ForegroundColor Cyan
Write-Host ""

# Export 1: Complete schema and data
Write-Host "1️⃣  Exporting complete database (schema + data)..." -ForegroundColor Yellow
$completeFile = "$sourceDbPath/complete_backup_$timestamp.sql"
pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p -f $completeFile 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Complete backup saved to: $completeFile" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to export complete backup" -ForegroundColor Red
}

# Export 2: Schema only
Write-Host "2️⃣  Exporting schema only..." -ForegroundColor Yellow
$schemaFile = "$sourceDbPath/schema_only_$timestamp.sql"
pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p -s -f $schemaFile 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Schema saved to: $schemaFile" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to export schema" -ForegroundColor Red
}

# Export 3: Data only
Write-Host "3️⃣  Exporting data only..." -ForegroundColor Yellow
$dataFile = "$sourceDbPath/data_only_$timestamp.sql"
pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p -a -f $dataFile 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Data saved to: $dataFile" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to export data" -ForegroundColor Red
}

# Export 4: Public schema only
Write-Host "4️⃣  Exporting public schema tables..." -ForegroundColor Yellow
$publicSchemaFile = "$sourceDbPath/public_schema_$timestamp.sql"
pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p -n public -f $publicSchemaFile 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Public schema saved to: $publicSchemaFile" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to export public schema" -ForegroundColor Red
}

# Clear password from environment
$env:PGPASSWORD = $null

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "✅ Database export completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Files created in $sourceDbPath/:" -ForegroundColor Yellow
Get-ChildItem $sourceDbPath -Filter "*$timestamp.sql" | ForEach-Object {
    $size = "{0:N2}" -f ($_.Length / 1KB)
    Write-Host "   - $($_.Name) ($size KB)" -ForegroundColor White
}
Write-Host ""
Write-Host "💡 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Review the exported schema file" -ForegroundColor White
Write-Host "   2. Compare with MIGRATIONPLAN.md" -ForegroundColor White
Write-Host "   3. Use schema_only file as reference for new Supabase account" -ForegroundColor White
Write-Host ""

