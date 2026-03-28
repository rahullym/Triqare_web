# =============================================
# Export Database Using Supabase CLI
# =============================================
# This script uses Supabase CLI to export the database
# Much easier than pg_dump as it handles authentication automatically
#
# Usage: .\scripts\export-database-supabase-cli.ps1

Write-Host "🗄️  Exporting Database with Supabase CLI..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Create sourcedb directory
$sourceDbPath = "sourcedb"
if (-not (Test-Path $sourceDbPath)) {
    New-Item -ItemType Directory -Path $sourceDbPath | Out-Null
    Write-Host "✅ Created directory: $sourceDbPath" -ForegroundColor Green
}

# Check if Supabase CLI is installed
Write-Host "🔍 Checking for Supabase CLI..." -ForegroundColor Cyan
$supabaseCli = (Get-Command supabase -ErrorAction SilentlyContinue)

if (-not $supabaseCli) {
    Write-Host "❌ Supabase CLI not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "📦 Installing Supabase CLI..." -ForegroundColor Yellow
    Write-Host ""
    
    # Install via npm
    npm install -g supabase
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Supabase CLI" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please install manually:" -ForegroundColor Yellow
        Write-Host "   npm install -g supabase" -ForegroundColor White
        Write-Host "Or:" -ForegroundColor Yellow
        Write-Host "   scoop install supabase" -ForegroundColor White
        exit 1
    }
    
    Write-Host "✅ Supabase CLI installed successfully!" -ForegroundColor Green
} else {
    Write-Host "✅ Supabase CLI found: $($supabaseCli.Source)" -ForegroundColor Green
}

Write-Host ""

# Parse project ref from .env.local
$envFile = ".env.local"
if (Test-Path $envFile) {
    $supabaseUrl = (Get-Content $envFile | Select-String -Pattern "NEXT_PUBLIC_SUPABASE_URL=(.+)").Matches.Groups[1].Value
    $projectRef = $supabaseUrl -replace "https://", "" -replace ".supabase.co", ""
    
    Write-Host "📊 Found project reference: $projectRef" -ForegroundColor Yellow
    Write-Host ""
}

# Login to Supabase (if not already logged in)
Write-Host "🔐 Checking Supabase authentication..." -ForegroundColor Cyan
$loginStatus = supabase projects list 2>&1

if ($loginStatus -match "not logged in" -or $loginStatus -match "error") {
    Write-Host "🔑 Please log in to Supabase..." -ForegroundColor Yellow
    supabase login
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Login failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ Authenticated with Supabase" -ForegroundColor Green
Write-Host ""

# Show available projects
Write-Host "📋 Your Supabase projects:" -ForegroundColor Cyan
supabase projects list
Write-Host ""

# Prompt for project ref if not found in .env
if (-not $projectRef) {
    $projectRef = Read-Host "Enter your project reference (from URL)"
}

Write-Host ""
Write-Host "📥 Exporting database schema..." -ForegroundColor Cyan

# Create timestamp
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# Export using Supabase CLI
$outputFile = "$sourceDbPath/supabase_dump_$timestamp.sql"

Write-Host "   Project: $projectRef" -ForegroundColor White
Write-Host "   Output: $outputFile" -ForegroundColor White
Write-Host ""

# Use supabase db dump command
supabase db dump --project-ref $projectRef --file $outputFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Database exported successfully!" -ForegroundColor Green
    
    $fileSize = (Get-Item $outputFile).Length
    $fileSizeKB = "{0:N2}" -f ($fileSize / 1KB)
    
    Write-Host ""
    Write-Host "📁 Export details:" -ForegroundColor Yellow
    Write-Host "   File: $outputFile" -ForegroundColor White
    Write-Host "   Size: $fileSizeKB KB" -ForegroundColor White
    Write-Host ""
    
    # Also export individual table schemas
    Write-Host "📊 Exporting table list..." -ForegroundColor Cyan
    $tableListFile = "$sourceDbPath/table_list_$timestamp.txt"
    
    supabase db dump --project-ref $projectRef --data-only:false | Select-String "CREATE TABLE" > $tableListFile
    
    Write-Host "✅ Table list saved to: $tableListFile" -ForegroundColor Green
    
} else {
    Write-Host ""
    Write-Host "❌ Export failed!" -ForegroundColor Red
    Write-Host "Please check:" -ForegroundColor Yellow
    Write-Host "   1. Project reference is correct" -ForegroundColor White
    Write-Host "   2. You have access to the project" -ForegroundColor White
    Write-Host "   3. Project is not paused" -ForegroundColor White
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "💡 Files in $sourceDbPath/:" -ForegroundColor Yellow
Get-ChildItem $sourceDbPath -Filter "*$timestamp*" | ForEach-Object {
    Write-Host "   - $($_.Name)" -ForegroundColor White
}
Write-Host ""

