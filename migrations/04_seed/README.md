# 🌱 Seed Data Scripts

This folder contains SQL INSERT scripts generated from the existing production database.

---

## 📋 Generated Files

| File | Description | Rows | Status |
|------|-------------|------|--------|
| `seed_countries.sql` | Countries master data | 3 | ✅ Ready |
| `seed_states.sql` | States master data | 2 | ✅ Ready |
| `seed_cities.sql` | Cities master data | 12 | ✅ Ready |
| `seed_pincodes.sql` | Pincodes/ZIP codes | 1,000 | ✅ Ready |
| `seed_hospitals.sql` | Hospital information | 194 | ✅ Ready |
| `seed_configurations.sql` | System configurations | 2 | ✅ Ready |

**Total Records**: 1,213 rows

---

## 🎯 Usage Instructions

### Option 1: Run Individual Scripts (Recommended)

Run scripts in **dependency order** in Supabase SQL Editor:

```sql
-- 1. Countries (no dependencies)
-- Run: seed_countries.sql

-- 2. Configurations (no dependencies)
-- Run: seed_configurations.sql

-- 3. States (depends on countries)
-- Run: seed_states.sql

-- 4. Cities (depends on states)
-- Run: seed_cities.sql

-- 5. Pincodes (depends on cities)
-- Run: seed_pincodes.sql

-- 6. Hospitals (depends on countries, states, cities, pincodes)
-- Run: seed_hospitals.sql
```

### Option 2: Run All at Once

Copy and paste all files in order into a single SQL query.

---

## ⚠️ Important Notes

1. **Dependencies**: Scripts must be run in the order listed above
2. **IDs Preserved**: All UUIDs are preserved from the source database
3. **Optional Truncate**: Each script has a commented-out TRUNCATE statement
4. **Idempotent**: Safe to run multiple times (uses same IDs)

---

## 🔧 How These Were Generated

Generated using: `scripts/create-seed-data-scripts.js`

```powershell
node scripts/create-seed-data-scripts.js
```

This script:
- Connects to existing Supabase database
- Exports data in dependency order
- Preserves all UUIDs and relationships
- Generates ready-to-run SQL INSERT statements

---

## 📊 Data Summary

### Countries (3 rows)
- India
- Togo
- United Kingdom

### States (2 rows)
- Maharashtra
- Kerala

### Cities (12 rows)
- Multiple cities across states

### Pincodes (1,000 rows)
- Postal codes linked to cities

### Hospitals (194 rows)
- Hospital details with:
  - Name, type, address
  - Contact information
  - Operating hours
  - GPS coordinates
  - Emergency contact details

### Configurations (2 rows)
- System-level configuration settings

---

## ✅ Verification

After running the scripts, verify with:

```sql
-- Check row counts
SELECT 'countries' as table_name, COUNT(*) as rows FROM public.countries
UNION ALL
SELECT 'states', COUNT(*) FROM public.states
UNION ALL
SELECT 'cities', COUNT(*) FROM public.cities
UNION ALL
SELECT 'pincodes', COUNT(*) FROM public.pincodes
UNION ALL
SELECT 'hospitals', COUNT(*) FROM public.hospitals
UNION ALL
SELECT 'configurations', COUNT(*) FROM public.configurations;
```

Expected results:
- countries: 3
- states: 2
- cities: 12
- pincodes: 1,000
- hospitals: 194
- configurations: 2

---

## 🔗 References

- Main Deployment Guide: `DEPLOYMENT_GUIDE.md`
- Migration Plan: `MIGRATIONPLAN.md`
- Source Database Export: `sourcedb/`

---

*Auto-generated: 2026-03-28*

