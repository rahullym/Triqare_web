# ⚡ Quick Start Deployment Guide

**Time Required**: 15-20 minutes  
**For**: Experienced developers who want the condensed version

---

## 🎯 Overview

Deploy Emergency Response System database to a **NEW** Supabase account in 8 steps.

⚠️ **WARNING**: This is for a NEW Supabase project only! Do NOT run on existing database.

---

## 📋 Prerequisites

- ✅ Supabase account
- ✅ Exported current database (run: `node scripts/export-tables-info.js`)
- ✅ `.env.local` backup created

---

## 🚀 Deployment Steps

### 1. Create New Supabase Project (3 min)

1. Go to https://app.supabase.com
2. **New Project** → Name: `emergency-response-prod`
3. Choose region → Create
4. Save: Project URL, Anon Key, Service Role Key

---

### 2. Run All Migrations (10 min)

**In Supabase SQL Editor**, run these scripts in order:

#### Script 1: Extensions & Functions
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### Script 2: Base Tables
Copy entire content from: `migrations/01_schema/02_tables.sql`

#### Script 3: Notifications Table
Copy entire content from: `migrations/03_notifications/01_notifications_table.sql`

#### Script 4: SOS Workflow Update
Copy entire content from: `migrations/99_updates/update_sos_status_workflow.sql`

#### Script 5: Missing Columns
```sql
-- SOS Requests columns
ALTER TABLE public.sos_requests 
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.drivers(user_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);

-- Drivers columns
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('available', 'assigned', 'on_trip', 'inactive')),
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(id),
ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES public.states(id),
ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id),
ADD COLUMN IF NOT EXISTS pincode_id UUID REFERENCES public.pincodes(id),
ADD COLUMN IF NOT EXISTS address_line TEXT;

-- Transport companies
ALTER TABLE public.transport_companies 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
```

#### Script 6: Performance Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_sos_requests_patient_id ON public.sos_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_sos_requests_driver_id ON public.sos_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_sos_requests_status ON public.sos_requests(status);
CREATE INDEX IF NOT EXISTS idx_sos_requests_requested_at ON public.sos_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_drivers_transport_company_id ON public.drivers(transport_company_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON public.users(clerk_user_id);
```

#### Script 7: Seed Configurations
```sql
INSERT INTO public.configurations (key, value, description)
VALUES 
    ('app_name', 'Emergency Response System', 'Application name'),
    ('emergency_number', '911', 'Emergency contact'),
    ('max_sos_distance_km', '50', 'Max distance for assignment'),
    ('auto_assign_enabled', 'true', 'Auto assign drivers'),
    ('notification_enabled', 'true', 'Enable notifications')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

#### Script 8: Seed Subscription Plans
```sql
INSERT INTO public.subscription_plans (id, name, description, price, duration_days, features, is_active)
VALUES 
    (gen_random_uuid(), 'Basic', 'Basic coverage', 0.00, 30, '{"max_sos_per_month": 3}', true),
    (gen_random_uuid(), 'Premium', 'Premium support', 29.99, 30, '{"max_sos_per_month": 10, "priority_support": true}', true),
    (gen_random_uuid(), 'Enterprise', 'Unlimited', 99.99, 30, '{"max_sos_per_month": -1, "dedicated_support": true}', true);
```

---

### 3. Enable Realtime (2 min)

**Database** → **Replication** → Enable for:
- users
- drivers
- sos_requests
- sos_request_assigned
- notifications

---

### 4. Update .env.local (1 min)

Replace with NEW Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[NEW_PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[NEW_ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[NEW_SERVICE_ROLE_KEY]
```

---

### 5. Verify (2 min)

```sql
-- Should return 19
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Should show all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

---

### 6. Test Application (2 min)

```powershell
npm run build
npm run dev
```

Open http://localhost:3000 and test user registration.

---

## ✅ Verification Checklist

- [ ] 19 tables created
- [ ] Realtime enabled for 5+ tables
- [ ] Environment variables updated
- [ ] Application builds successfully
- [ ] User registration works
- [ ] Realtime connections active

---

## 🔧 Quick Troubleshooting

| Issue | Quick Fix |
|-------|-----------|
| Table exists error | Safe to ignore if re-running |
| Connection error | Check `.env.local` credentials |
| Realtime not working | Enable in Database → Replication |
| Build errors | Verify env vars, restart dev server |

---

## 📚 Full Documentation

For detailed step-by-step guide: **`DEPLOYMENT_GUIDE.md`**  
For migration details: **`MIGRATIONPLAN.md`**  
For database comparison: **`sourcedb/COMPARISON_WITH_MIGRATION_PLAN.md`**

---

**Done! Your new database is ready! 🎉**

Next: Import location data (optional) or start using the app!

