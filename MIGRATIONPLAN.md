# 🗄️ Database Migration Plan - New Supabase Account

**Project**: Emergency Response System
**Version**: 1.0.0
**Date**: 2026-03-28
**Status**: Complete Migration Plan
**Objective**: Deploy complete database schema to a NEW Supabase account

---

## 🎯 **Migration Objective**

**Primary Goal**: Deploy the complete Emergency Response System database schema to a **NEW Supabase account**.

### What This Plan Does:
✅ Provides complete SQL schema for fresh deployment
✅ Documents all 18 tables and their dependencies
✅ Includes all indexes, constraints, and RLS policies
✅ Provides step-by-step deployment instructions
✅ Includes verification and rollback procedures

### What This Plan Does NOT Do:
❌ Modify existing production Supabase database
❌ Migrate data from old database to new
❌ Create backup of existing database
❌ Run ALTER statements on existing tables

### Use Cases:
- 🆕 Setting up production environment for the first time
- 🔄 Creating a new staging/testing environment
- 🌍 Deploying to a different region
- 🏢 Setting up for a new client/organization

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Database Tables](#database-tables)
3. [Table Dependencies](#table-dependencies)
4. [Schema Updates Required](#schema-updates-required)
5. [Migration Order](#migration-order)
6. [SQL Migration Scripts](#sql-migration-scripts)
7. [Deployment Steps](#deployment-steps)
8. [Rollback Plan](#rollback-plan)
9. [Verification Steps](#verification-steps)

---

## 🎯 Overview

This migration plan provides a **complete, production-ready database deployment** for a **NEW Supabase account**.

⚠️ **IMPORTANT**:
- This is for deploying to a **NEW/FRESH** Supabase project
- **DO NOT** run these scripts on the existing Supabase account
- All scripts are designed for clean installation
- No data migration from old database is included (schema only)

### Migration Scope:
✅ Complete database schema (18 tables)
✅ All foreign key relationships
✅ Indexes for performance
✅ Row Level Security (RLS) policies
✅ Triggers and constraints
✅ Real-time replication setup
✅ Seed data (configurations, subscription plans)

### Key Features:
- ✅ Real-time data synchronization via Supabase Realtime
- ✅ Role-based access control (Admin, ERT, Transport Company, Driver, Patient)
- ✅ Location hierarchy (Countries → States → Cities → Pincodes)
- ✅ SOS workflow with driver assignment
- ✅ Subscription and billing management
- ✅ Notification system

---

## 📊 Database Tables

### **Total Tables**: 18

#### **1. Core Authentication & Users**
| Table | Purpose | Dependencies |
|-------|---------|--------------|
| `users` | Central user authentication and profiles | None (Root table) |

#### **2. Location Hierarchy** (Master Data)
| Table | Purpose | Dependencies |
|-------|---------|--------------|
| `countries` | Country master data | None |
| `states` | States/provinces | `countries` |
| `cities` | Cities within states | `states` |
| `pincodes` | Postal codes | `cities` |

#### **3. Healthcare Network**
| Table | Purpose | Dependencies |
|-------|---------|--------------|
| `hospitals` | Hospital/healthcare facilities | `countries`, `states`, `cities`, `pincodes` |

#### **4. Role-Specific Profiles**
| Table | Purpose | Dependencies |
|-------|---------|--------------|
| `patients` | Patient profile and medical info | `users`, `hospitals`, `countries`, `states`, `cities`, `pincodes` |
| `transport_companies` | Transport company profiles | `users`, `countries`, `states`, `cities`, `pincodes` |
| `drivers` | Driver profiles and availability | `users`, `transport_companies` |

#### **5. Emergency Operations**
| Table | Purpose | Dependencies |
|-------|---------|--------------|
| `emergency_contacts` | Patient emergency contacts | `patients` |
| `sos_requests` | Emergency SOS requests | `patients`, `hospitals`, `drivers` |
| `sos_request_assigned` | Driver assignment history | `sos_requests`, `drivers` |

#### **6. Billing & Subscriptions**
| Table | Purpose | Dependencies |
|-------|---------|--------------|
| `subscription_plans` | Available subscription plans | None |
| `patient_subscriptions` | Patient subscription records | `patients`, `subscription_plans` |
| `billing_history` | Payment transactions | `patient_subscriptions` |

#### **7. System Management**
| Table | Purpose | Dependencies |
|-------|---------|--------------|
| `configurations` | System config key-value store | None |
| `announcements` | System-wide announcements | None |
| `notifications` | User notifications & alerts | `users` |
| `pending_csv_imports` | Temporary CSV import storage | None |

---

## 🔗 Table Dependencies

### Dependency Graph

```
Level 0 (No Dependencies):
├── users
├── countries
├── configurations
├── subscription_plans
├── announcements
└── pending_csv_imports

Level 1 (Depends on Level 0):
├── states → countries
├── notifications → users
└── transport_companies → users, countries

Level 2 (Depends on Level 1):
├── cities → states
└── drivers → users, transport_companies

Level 3 (Depends on Level 2):
├── pincodes → cities
└── hospitals → countries, states, cities (optional)

Level 4 (Depends on Multiple Levels):
└── patients → users, hospitals, countries, states, cities, pincodes

Level 5 (Depends on Level 4):
├── emergency_contacts → patients
├── sos_requests → patients, hospitals, drivers
└── patient_subscriptions → patients, subscription_plans

Level 6 (Depends on Level 5):
├── sos_request_assigned → sos_requests, drivers
└── billing_history → patient_subscriptions
```

---

## 🔧 Schema Updates Required

⚠️ **NOTE**: These are already included in the complete deployment script for the NEW Supabase account. This section documents what differs from the base schema.

### **Critical Updates for Production Deployment**

#### **1. SOS Requests Table - Add Missing Columns**

**Current Issue**: The base schema is missing several columns that the application uses.

**Required Columns**:
```sql
ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.drivers(user_id) ON DELETE SET NULL;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT false;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);
```

**Update Status Enum** (see `migrations/99_updates/update_sos_status_workflow.sql`):
```sql
-- Drop old constraint
ALTER TABLE public.sos_requests
DROP CONSTRAINT IF EXISTS sos_requests_status_check;

-- Add new constraint with updated workflow
ALTER TABLE public.sos_requests
ADD CONSTRAINT sos_requests_status_check
CHECK (status IN (
    'SOS Triggered',
    'Driver En Route',
    'Transport Arrived',
    'User Picked Up',
    'Arrived at Hospital',
    'Cancelled'
));

-- Update default value
ALTER TABLE public.sos_requests
ALTER COLUMN status SET DEFAULT 'SOS Triggered';
```

---

#### **2. Drivers Table - Add Missing Columns**

**Required Columns**:
```sql
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(50);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'inactive'
CHECK (status IN ('available', 'assigned', 'on_trip', 'inactive'));

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES public.states(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS pincode_id UUID REFERENCES public.pincodes(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS address_line TEXT;
```

---

#### **3. Transport Companies - Add Verification Column**

```sql
ALTER TABLE public.transport_companies
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
```

---

#### **4. Create Indexes for Performance**

```sql
-- SOS Requests indexes
CREATE INDEX IF NOT EXISTS idx_sos_requests_patient_id ON public.sos_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_sos_requests_driver_id ON public.sos_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_sos_requests_status ON public.sos_requests(status);
CREATE INDEX IF NOT EXISTS idx_sos_requests_requested_at ON public.sos_requests(requested_at DESC);

-- Drivers indexes
CREATE INDEX IF NOT EXISTS idx_drivers_transport_company_id ON public.drivers(transport_company_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_current_request_id ON public.drivers(current_request_id);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON public.drivers(latitude, longitude) WHERE latitude IS NOT NULL;

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON public.users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);
```

---

## 📝 Migration Order

**IMPORTANT**: Tables must be created in this exact order due to foreign key dependencies.

### Phase 1: Foundation Tables (No Dependencies)
```sql
-- Run these in any order
1. migrations/01_schema/01_extensions.sql          -- Enable required PostgreSQL extensions
2. Create: users
3. Create: countries
4. Create: configurations
5. Create: subscription_plans
6. Create: announcements
7. Create: pending_csv_imports
```

### Phase 2: Level 1 Dependencies
```sql
8. Create: states (depends on countries)
9. Create: notifications (depends on users)
10. Create: transport_companies (depends on users, countries)
```

### Phase 3: Level 2 Dependencies
```sql
11. Create: cities (depends on states)
12. Create: drivers (depends on users, transport_companies)
```

### Phase 4: Level 3 Dependencies
```sql
13. Create: pincodes (depends on cities)
14. Create: hospitals (depends on countries, states, cities, pincodes)
```

### Phase 5: Level 4 Dependencies
```sql
15. Create: patients (depends on users, hospitals, countries, states, cities, pincodes)
```

### Phase 6: Level 5 Dependencies
```sql
16. Create: emergency_contacts (depends on patients)
17. Create: sos_requests (depends on patients, hospitals, drivers)
18. Create: patient_subscriptions (depends on patients, subscription_plans)
```

### Phase 7: Level 6 Dependencies
```sql
19. Create: sos_request_assigned (depends on sos_requests, drivers)
20. Create: billing_history (depends on patient_subscriptions)
```

### Phase 8: Schema Updates
```sql
21. migrations/99_updates/update_sos_status_workflow.sql  -- Update SOS status enum
22. Add missing columns to sos_requests (driver_id, requested_at, assigned_at, etc.)
23. Add missing columns to drivers (aadhar_number, is_verified, status, etc.)
24. Add is_verified to transport_companies
```

### Phase 9: Indexes & Performance
```sql
25. migrations/01_schema/03_indexes.sql            -- Create all indexes
26. Create additional indexes listed in Schema Updates section
```

### Phase 10: Security & Permissions
```sql
27. migrations/02_security/01_rls_policies.sql     -- Enable RLS and create policies
28. migrations/02_security/02_grants.sql           -- Grant permissions
```

### Phase 11: Seed Data
```sql
29. migrations/03_seed/01_configurations.sql       -- Seed system configurations
30. migrations/03_seed/02_subscription_plans.sql   -- Seed subscription plans
```

---

## 📜 SQL Migration Scripts

### **Complete Migration Script** (migrations/deploy.sql)

```sql
-- =============================================
-- EMERGENCY RESPONSE SYSTEM - COMPLETE DEPLOYMENT
-- =============================================
-- Version: 1.0.0
-- Date: 2026-03-28
-- Description: Complete database setup for production deployment

BEGIN;

-- =============================================
-- PHASE 1: EXTENSIONS
-- =============================================
\echo '📦 Installing PostgreSQL extensions...'
\i migrations/01_schema/01_extensions.sql

-- =============================================
-- PHASE 2: CORE TABLES
-- =============================================
\echo '🗄️ Creating database tables...'
\i migrations/01_schema/02_tables.sql

-- =============================================
-- PHASE 3: NOTIFICATIONS TABLE
-- =============================================
\echo '🔔 Creating notifications table...'
\i migrations/03_notifications/01_notifications_table.sql

-- =============================================
-- PHASE 4: SCHEMA UPDATES
-- =============================================
\echo '🔧 Applying schema updates...'

-- Update SOS workflow
\i migrations/99_updates/update_sos_status_workflow.sql

-- Add missing columns to sos_requests
ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.drivers(user_id) ON DELETE SET NULL;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT false;

ALTER TABLE public.sos_requests
ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);

-- Add missing columns to drivers
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(50);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'inactive'
CHECK (status IN ('available', 'assigned', 'on_trip', 'inactive'));

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES public.states(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS pincode_id UUID REFERENCES public.pincodes(id);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS address_line TEXT;

-- Add verification to transport companies
ALTER TABLE public.transport_companies
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- =============================================
-- PHASE 5: INDEXES
-- =============================================
\echo '⚡ Creating indexes...'
\i migrations/01_schema/03_indexes.sql

-- Create additional performance indexes
CREATE INDEX IF NOT EXISTS idx_sos_requests_patient_id ON public.sos_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_sos_requests_driver_id ON public.sos_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_sos_requests_status ON public.sos_requests(status);
CREATE INDEX IF NOT EXISTS idx_sos_requests_requested_at ON public.sos_requests(requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_drivers_transport_company_id ON public.drivers(transport_company_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_current_request_id ON public.drivers(current_request_id);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON public.drivers(latitude, longitude) WHERE latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON public.users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- =============================================
-- PHASE 6: CONSTRAINTS
-- =============================================
\echo '🔒 Adding constraints...'
\i migrations/01_schema/04_constraints.sql

-- =============================================
-- PHASE 7: TRIGGERS
-- =============================================
\echo '⚙️ Creating triggers...'
\i migrations/01_schema/05_triggers.sql

-- =============================================
-- PHASE 8: SECURITY (RLS & GRANTS)
-- =============================================
\echo '🛡️ Configuring Row Level Security...'
\i migrations/02_security/01_rls_policies.sql

\echo '👤 Granting permissions...'
\i migrations/02_security/02_grants.sql

-- =============================================
-- PHASE 9: SEED DATA
-- =============================================
\echo '🌱 Seeding initial data...'
\i migrations/03_seed/01_configurations.sql
\i migrations/03_seed/02_subscription_plans.sql

COMMIT;

\echo '✅ Database migration completed successfully!'
```

---

## 🚀 Deployment Steps

### ⚠️ **CRITICAL: NEW SUPABASE ACCOUNT ONLY**

**This deployment is for a BRAND NEW Supabase account/project ONLY!**

✅ **DO**: Create a fresh Supabase project and run these scripts there
❌ **DON'T**: Run these scripts on your existing production Supabase account

---

### **Pre-Deployment Checklist**

- [ ] Create a **NEW** Supabase project (https://app.supabase.com)
- [ ] Note down the new project's connection details
- [ ] Review all migration scripts in this repository
- [ ] Update .env.local with NEW Supabase credentials:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Ensure Clerk authentication is configured
- [ ] **DO NOT** point to existing production database

### **Step-by-Step Deployment**

#### **Option 1: Using Supabase SQL Editor** (Recommended for NEW account setup)

1. **Create NEW Supabase Project**
   ```
   1. Go to https://app.supabase.com
   2. Click "New Project"
   3. Choose organization
   4. Enter project name (e.g., "emergency-response-prod")
   5. Create strong database password
   6. Select region closest to your users
   7. Click "Create new project"
   8. Wait for project to initialize (~2 minutes)
   ```

2. **Login to NEW Supabase Dashboard**
   ```
   https://app.supabase.com
   Select your NEW project (NOT the old one!)
   ```

3. **Navigate to SQL Editor**
   ```
   Dashboard → SQL Editor → New Query
   ```

4. **Run Complete Deployment Script**
   ```sql
   -- IMPORTANT: Verify you're in the NEW project (check project name in top-left)

   -- Copy and paste the entire content from migrations/deploy.sql
   -- OR run each migration file individually in order:

   -- 1. Extensions
   -- 2. Tables (migrations/01_schema/02_tables.sql)
   -- 3. Notifications (migrations/03_notifications/01_notifications_table.sql)
   -- 4. Updates (migrations/99_updates/update_sos_status_workflow.sql)
   -- 5. Schema updates (from this document)
   -- 6. Indexes
   -- 7. RLS policies
   -- 8. Seed data
   ```

4. **Verify Tables Created**
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

5. **Verify Row Level Security**
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public';
   ```

---

#### **Option 2: Using psql Command Line**

```bash
# Set connection string
export DATABASE_URL="postgresql://[USER]:[PASSWORD]@[HOST]:6543/postgres"

# Run complete deployment
psql $DATABASE_URL -f migrations/deploy.sql

# Or run migrations individually
psql $DATABASE_URL -f migrations/01_schema/01_extensions.sql
psql $DATABASE_URL -f migrations/01_schema/02_tables.sql
psql $DATABASE_URL -f migrations/03_notifications/01_notifications_table.sql
psql $DATABASE_URL -f migrations/99_updates/update_sos_status_workflow.sql
# ... etc
```

---

#### **Option 3: Using Supabase CLI**

```bash
# Install Supabase CLI
npm install -g supabase

# Link to project
supabase link --project-ref [YOUR_PROJECT_REF]

# Run migrations
supabase db push

# Or apply specific migration
supabase db execute -f migrations/deploy.sql
```

---

### **Post-Deployment Steps**

1. **Verify All Tables Exist**
   ```sql
   SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
   -- Expected: 18+ tables
   ```

2. **Verify Indexes**
   ```sql
   SELECT tablename, indexname
   FROM pg_indexes
   WHERE schemaname = 'public';
   ```

3. **Test Real-time Subscriptions**
   ```sql
   -- Ensure Realtime is enabled for required tables
   SELECT * FROM supabase_realtime.subscription;
   ```

4. **Enable Realtime for Tables** (in Supabase Dashboard)
   ```
   Database → Replication → Enable for:
   - users
   - drivers
   - sos_requests
   - notifications
   ```

5. **Test Application**
   - Create a test user
   - Create a test SOS request
   - Verify real-time updates work
   - Test driver assignment

---

## 🔄 Rollback Plan

### **Emergency Rollback Procedure**

If the migration fails or causes issues, follow this rollback procedure:

#### **Step 1: Restore from Backup**

```bash
# Using Supabase Dashboard
Dashboard → Settings → Backups → Select backup → Restore

# OR using psql
pg_restore -d postgres backup_file.sql
```

#### **Step 2: Run Rollback Script**

```sql
-- migrations/rollback.sql
BEGIN;

\echo '🔙 Rolling back database changes...'

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS public.billing_history CASCADE;
DROP TABLE IF EXISTS public.sos_request_assigned CASCADE;
DROP TABLE IF EXISTS public.patient_subscriptions CASCADE;
DROP TABLE IF EXISTS public.sos_requests CASCADE;
DROP TABLE IF EXISTS public.emergency_contacts CASCADE;
DROP TABLE IF EXISTS public.patients CASCADE;
DROP TABLE IF EXISTS public.hospitals CASCADE;
DROP TABLE IF EXISTS public.pincodes CASCADE;
DROP TABLE IF EXISTS public.cities CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
DROP TABLE IF EXISTS public.transport_companies CASCADE;
DROP TABLE IF EXISTS public.states CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.pending_csv_imports CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.configurations CASCADE;
DROP TABLE IF EXISTS public.countries CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

COMMIT;

\echo '✅ Rollback completed!'
```

---

## ✅ Verification Steps

### **1. Table Existence Check**

```sql
-- Verify all 18 tables exist
SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Expected output:
-- announcements
-- billing_history
-- cities
-- configurations
-- countries
-- drivers
-- emergency_contacts
-- hospitals
-- notifications
-- patients
-- patient_subscriptions
-- pincodes
-- pending_csv_imports
-- sos_requests
-- sos_request_assigned
-- states
-- subscription_plans
-- transport_companies
-- users
```

---

### **2. Column Verification**

```sql
-- Verify sos_requests has required columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sos_requests'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Must include: driver_id, requested_at, assigned_at, completed_at, auto_assigned

-- Verify drivers has required columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'drivers'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Must include: aadhar_number, is_verified, status, latitude, longitude, last_updated_at
```

---

### **3. Foreign Key Constraints**

```sql
-- Verify all foreign key relationships
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
```

---

### **4. Index Verification**

```sql
-- Verify performance indexes exist
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

---

### **5. Row Level Security Check**

```sql
-- Verify RLS is enabled on sensitive tables
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'patients', 'sos_requests', 'drivers', 'notifications')
ORDER BY tablename;

-- All should have rowsecurity = TRUE
```

---

### **6. Trigger Verification**

```sql
-- Verify triggers exist
SELECT
    trigger_schema,
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

---

### **7. Test Data Insertion**

```sql
-- Test creating a user
INSERT INTO public.users (clerk_user_id, email, role, full_name)
VALUES ('test_clerk_123', 'test@example.com', 'patient', 'Test User')
RETURNING *;

-- Test creating a country
INSERT INTO public.countries (name, code)
VALUES ('Test Country', 'TC')
RETURNING *;

-- Clean up test data
DELETE FROM public.users WHERE clerk_user_id = 'test_clerk_123';
DELETE FROM public.countries WHERE code = 'TC';
```

---

### **8. Real-time Subscription Test**

```javascript
// Test in browser console or Node.js
import { supabase } from '@/lib/supabase'

const channel = supabase
  .channel('test-realtime')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'sos_requests' },
    (payload) => console.log('✅ Realtime working:', payload)
  )
  .subscribe()

// Should log connection status
```

---

## 📊 Summary

### **Tables by Category**

| Category | Count | Tables |
|----------|-------|--------|
| Core Auth | 1 | users |
| Location Hierarchy | 4 | countries, states, cities, pincodes |
| Healthcare | 1 | hospitals |
| User Profiles | 3 | patients, transport_companies, drivers |
| Emergency Ops | 3 | emergency_contacts, sos_requests, sos_request_assigned |
| Billing | 3 | subscription_plans, patient_subscriptions, billing_history |
| System | 3 | configurations, announcements, notifications, pending_csv_imports |
| **TOTAL** | **18** | |

### **Key Dependencies to Remember**

1. ✅ `sos_requests.driver_id` → `drivers.user_id`
2. ✅ `sos_requests.patient_id` → `patients.user_id`
3. ✅ `drivers.transport_company_id` → `transport_companies.user_id`
4. ✅ All profile tables → `users.id`
5. ✅ Location hierarchy: countries → states → cities → pincodes

### **Critical Columns Added**

| Table | New Columns | Purpose |
|-------|-------------|---------|
| `sos_requests` | driver_id, requested_at, assigned_at, completed_at, auto_assigned, patient_name | Driver assignment & tracking |
| `drivers` | aadhar_number, is_verified, status, latitude, longitude, last_updated_at, location fields | Verification & location tracking |
| `transport_companies` | is_verified | Company verification status |

---

## 🎯 Next Steps After Migration

1. ✅ **Seed Master Data**
   - Import countries, states, cities, pincodes
   - Import hospitals
   - Create subscription plans

2. ✅ **Configure Clerk Authentication**
   - Set up webhook to sync users
   - Configure role-based redirects

3. ✅ **Test Real-time Features**
   - SOS request creation
   - Driver assignment
   - Status updates

4. ✅ **Monitor Performance**
   - Check query performance
   - Verify indexes are being used
   - Monitor Realtime connections

5. ✅ **Security Audit**
   - Review RLS policies
   - Test role-based access
   - Verify data isolation

---

**Migration Plan Complete!** 🎉

For questions or issues, refer to:
- `migrations/README.md`
- `migrations/DEPLOYMENT_GUIDE.md`
- `migrations/MIGRATION_SUMMARY.md`

