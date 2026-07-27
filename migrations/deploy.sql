-- =============================================
-- MASTER DEPLOYMENT SCRIPT
-- Execute all migration files in correct order
-- =============================================

-- This script deploys the complete database schema
-- Run this on a fresh Supabase instance

\echo '=========================================='
\echo 'Starting Database Migration'
\echo '=========================================='

-- =============================================
-- STEP 1: EXTENSIONS
-- =============================================

\echo ''
\echo 'Step 1: Installing PostgreSQL Extensions...'
\i 01_schema/01_extensions.sql

-- =============================================
-- STEP 2: SCHEMA - TABLES
-- =============================================

\echo ''
\echo 'Step 2: Creating Database Tables...'
\i 01_schema/02_tables.sql

-- =============================================
-- STEP 3: SCHEMA - INDEXES
-- =============================================

\echo ''
\echo 'Step 3: Creating Performance Indexes...'
\i 01_schema/03_indexes.sql

-- =============================================
-- STEP 4: SCHEMA - CONSTRAINTS
-- =============================================

\echo ''
\echo 'Step 4: Adding Foreign Key Constraints...'
\i 01_schema/04_constraints.sql

-- =============================================
-- STEP 5: SCHEMA - TRIGGERS
-- =============================================

\echo ''
\echo 'Step 5: Creating Triggers and Functions...'
\i 01_schema/05_triggers.sql

-- =============================================
-- STEP 5b: DRIVER APPLICATIONS (QSoS Phase 2)
-- =============================================

\echo ''
\echo 'Step 5b: Creating Driver Applications table + functions...'
\i 01_schema/06_driver_applications.sql

-- =============================================
-- STEP 6: SECURITY - RLS POLICIES
-- =============================================

\echo ''
\echo 'Step 6: Applying Row Level Security Policies...'
\i 02_security/01_rls_policies.sql
\i 02_security/03_driver_applications_rls.sql

-- =============================================
-- STEP 7: SECURITY - GRANTS
-- =============================================

\echo ''
\echo 'Step 7: Granting Database Permissions...'
\i 02_security/02_grants.sql

-- =============================================
-- STEP 8: SEED DATA - CONFIGURATIONS
-- =============================================

\echo ''
\echo 'Step 8: Inserting System Configurations...'
\i 03_seed/01_configurations.sql

-- =============================================
-- STEP 9: SEED DATA - SUBSCRIPTION PLANS
-- =============================================

\echo ''
\echo 'Step 9: Inserting Subscription Plans...'
\i 03_seed/02_subscription_plans.sql

-- =============================================
-- STEP 10: NOTIFICATIONS TABLE
-- =============================================

\echo ''
\echo 'Step 10: Creating Notifications table + policies...'
\i 03_notifications/01_notifications_table.sql

-- =============================================
-- STEP 11: SEED DATA - REFERENCE DATA (countries/states/cities/pincodes/hospitals)
-- =============================================

\echo ''
\echo 'Step 11: Seeding reference data...'
\i 04_seed/seed_countries.sql
\i 04_seed/seed_states.sql
\i 04_seed/seed_cities.sql
\i 04_seed/seed_pincodes.sql
\i 04_seed/seed_hospitals.sql
\i 04_seed/seed_configurations.sql

-- =============================================
-- STEP 12: INCREMENTAL UPDATES (99_updates)
-- =============================================
-- These patches must be applied on every fresh deploy or the schema drifts from
-- what the app reads/writes. Order matters where one patch depends on another.

\echo ''
\echo 'Step 12: Applying incremental updates...'
-- Canonical SOS status workflow (replaces the original lowercase CHECK constraint).
\i 99_updates/update_sos_status_workflow.sql
-- Inline operational columns the app reads/writes on sos_requests.
\i 99_updates/sos_requests_inline_columns.sql
-- Transport dashboard enhancement (assignment-log columns + indexes).
\i 99_updates/transport_dashboard_enhancement.sql
-- Emergency contact email + photo columns.
\i 99_updates/emergency_contact_email_and_photo.sql
-- Driver application address bifurcation + relaxed mandatory fields.
\i 99_updates/driver_application_address_and_optional_fields.sql
-- Driver KYC document storage bucket.
\i 99_updates/driver_documents_storage_bucket.sql
-- users.onboarding_completed flag.
\i 99_updates/add_users_onboarding_completed.sql
-- Supabase Auth migration (Phase 1, additive): auth_user_id link column, the
-- handle_new_auth_user() link-by-email trigger, and authenticated-scoped RLS
-- policies added alongside the Clerk-era ones. Non-breaking. The destructive
-- hardening (supabase_auth_rls_hardening.sql) is applied only at the final cutover.
\i 99_updates/supabase_auth_migration.sql
-- Terms & Conditions acceptance tracking: users.terms_* columns, the append-only
-- terms_acceptances audit table, the current_terms_version config seed, and the
-- record_terms_acceptance() RPC.
\i 99_updates/terms_acceptance_tracking.sql

-- =============================================
-- DEPLOYMENT COMPLETE
-- =============================================

\echo ''
\echo '=========================================='
\echo 'Database Migration Completed Successfully!'
\echo '=========================================='
\echo ''
\echo 'Next Steps:'
\echo '1. Verify all tables exist'
\echo '2. Configure Clerk webhook URL'
\echo '3. Update environment variables'
\echo '4. Test authentication flow'
\echo '=========================================='

