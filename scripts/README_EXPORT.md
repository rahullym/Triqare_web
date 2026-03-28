# 📥 Database Export Scripts

This folder contains scripts to export your **existing** Supabase database for backup and reference before migrating to a new Supabase account.

---

## 🎯 Purpose

Export the current database to:
- ✅ Create a backup before migration
- ✅ Document existing schema
- ✅ Reference for new database setup
- ✅ Compare with migration plan

---

## 📋 Available Export Methods

### **Method 1: Node.js Script** (Recommended - Easiest)

**Best for**: Quick table inventory and data inspection

```powershell
# Run the export
node scripts/export-tables-info.js
```

**What it exports**:
- ✅ List of all tables
- ✅ Row count per table
- ✅ Column names
- ✅ Sample data (first 3 rows per table)
- ✅ JSON and Markdown reports

**Output files** (in `sourcedb/`):
- `database_info_[timestamp].json` - Complete table information
- `database_report_[timestamp].md` - Human-readable report
- `table_list_[timestamp].txt` - Simple table list

**Requirements**:
- Node.js (already installed)
- `.env.local` file with Supabase credentials

---

### **Method 2: Supabase CLI** (Recommended - Most Complete)

**Best for**: Complete SQL dump including schema, data, and RLS policies

```powershell
# Install Supabase CLI (first time only)
npm install -g supabase

# Run the export
.\scripts\export-database-supabase-cli.ps1
```

**What it exports**:
- ✅ Complete SQL dump
- ✅ All table schemas
- ✅ All data
- ✅ RLS policies
- ✅ Functions and triggers
- ✅ Indexes

**Output files** (in `sourcedb/`):
- `supabase_dump_[timestamp].sql` - Complete database dump
- `table_list_[timestamp].txt` - Table creation statements

**Requirements**:
- Supabase CLI (script will install if missing)
- Supabase account access

---

### **Method 3: pg_dump** (Advanced)

**Best for**: If you need PostgreSQL-native tools

```powershell
.\scripts\export-database.ps1
```

**What it exports**:
- ✅ Complete backup (schema + data)
- ✅ Schema only
- ✅ Data only
- ✅ Public schema only

**Output files** (in `sourcedb/`):
- `complete_backup_[timestamp].sql` - Full dump
- `schema_only_[timestamp].sql` - Schema without data
- `data_only_[timestamp].sql` - Data without schema
- `public_schema_[timestamp].sql` - Public schema tables

**Requirements**:
- PostgreSQL client tools (`pg_dump`)
- Database password from Supabase dashboard

---

## 🚀 Quick Start (Recommended Method)

### Step 1: Run Node.js Export

```powershell
# Navigate to project root
cd c:\emergency-app\test\prototype\deploynow

# Run export script
node scripts/export-tables-info.js
```

### Step 2: Review Output

```powershell
# Check exported files
cd sourcedb
dir

# View the report
notepad database_report_*.md
```

---

## 📊 What Gets Exported

| Method | Tables | Data | Schema | RLS | Functions | Size |
|--------|--------|------|--------|-----|-----------|------|
| Node.js | ✅ List | ✅ Sample | ❌ | ❌ | ❌ | ~100KB |
| Supabase CLI | ✅ | ✅ All | ✅ | ✅ | ✅ | ~5-50MB |
| pg_dump | ✅ | ✅ All | ✅ | ✅ | ✅ | ~5-50MB |

---

## 📁 Output Directory Structure

```
sourcedb/
├── database_info_[timestamp].json        # JSON report
├── database_report_[timestamp].md        # Markdown report
├── table_list_[timestamp].txt            # Simple list
├── supabase_dump_[timestamp].sql         # Complete SQL dump
├── complete_backup_[timestamp].sql       # pg_dump full
├── schema_only_[timestamp].sql           # pg_dump schema
└── data_only_[timestamp].sql             # pg_dump data
```

---

## ⚠️ Important Notes

1. **This exports FROM your existing database**
   - NOT for the new database
   - This is your current production data
   - Keep these files as backup

2. **Sensitive Data**
   - Exported files may contain user data
   - Keep `sourcedb/` folder secure
   - Don't commit to version control
   - Already added to `.gitignore`

3. **Large Databases**
   - Exports may take several minutes
   - File sizes can be large (50MB+)
   - Ensure sufficient disk space

---

## 🔍 Using the Exported Data

### Compare with Migration Plan

```powershell
# View exported schema
notepad sourcedb\schema_only_*.sql

# Compare with migration plan
notepad MIGRATIONPLAN.md
```

### Verify All Tables Exported

```powershell
# Count tables in export
node scripts/export-tables-info.js

# Compare with expected 18 tables from MIGRATIONPLAN.md
```

### Use as Reference for New Database

The exported schema can help you:
- ✅ Verify migration completeness
- ✅ Check for custom modifications
- ✅ Identify missing indexes
- ✅ Document RLS policies

---

## 🛠️ Troubleshooting

### "Command not found: node"

```powershell
# Check Node.js installation
node --version

# If not installed, download from https://nodejs.org
```

### "Cannot connect to database"

1. Check `.env.local` has correct credentials
2. Verify Supabase project is not paused
3. Check your internet connection

### "Permission denied"

```powershell
# Run PowerShell as Administrator
# Or set execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "pg_dump not found"

Use Method 1 (Node.js) or Method 2 (Supabase CLI) instead.

---

## 📚 Next Steps After Export

1. ✅ Review exported files
2. ✅ Compare with `MIGRATIONPLAN.md`
3. ✅ Verify all 18 tables are present
4. ✅ Check for any custom tables not in migration plan
5. ✅ Proceed with new Supabase account setup

---

## 🔗 Related Documents

- `MIGRATIONPLAN.md` - Complete migration plan for new database
- `.gitignore` - Ensures sourcedb/ is not committed
- `migrations/` - SQL scripts for new database

---

**Ready to export? Start with Method 1 (Node.js)!** 🚀

