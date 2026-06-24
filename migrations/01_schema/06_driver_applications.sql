-- =============================================
-- DRIVER APPLICATIONS (QSoS Phase 2 — Feature 1)
-- Public driver KYC application + admin review workflow
-- =============================================
--
-- Design notes:
--   * Aadhaar & driving-license numbers are NOT stored in plaintext. They are
--     encrypted application-side (AES-256-GCM) and persisted as
--     ciphertext/iv/tag triples, plus a plaintext last-4 for masked display.
--     See src/lib/crypto/fieldEncryption.ts.
--   * All public writes go through the service-role server routes; RLS is
--     deny-by-default for anon/authenticated (see 02_security/03_*).
--   * Reference numbers and the submission rate-limiter use the two helper
--     functions defined at the bottom of this file (service_role only).

-- =============================================
-- TABLE: driver_applications
-- =============================================

CREATE TABLE IF NOT EXISTS public.driver_applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reference_number VARCHAR(32) UNIQUE NOT NULL,

    -- Personal
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    address TEXT NOT NULL,                       -- street / house / area line
    city VARCHAR(100),                           -- required by the form; nullable for legacy rows
    state VARCHAR(100),                          -- required by the form; nullable for legacy rows
    pincode VARCHAR(10),                         -- required by the form; nullable for legacy rows
    emergency_contact_name VARCHAR(255) NOT NULL,
    emergency_contact_phone VARCHAR(20) NOT NULL,

    -- Aadhaar (encrypted at rest)
    aadhaar_ciphertext TEXT NOT NULL,
    aadhaar_iv TEXT NOT NULL,
    aadhaar_tag TEXT NOT NULL,
    aadhaar_last4 VARCHAR(4) NOT NULL,

    -- Vehicle
    vehicle_registration VARCHAR(50) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,          -- 'ambulance' | 'medical_van'
    vehicle_make_model VARCHAR(255),            -- optional
    vehicle_year INTEGER,                       -- optional
    ambulance_permit_number VARCHAR(100),       -- optional

    -- License (number encrypted at rest)
    license_ciphertext TEXT NOT NULL,
    license_iv TEXT NOT NULL,
    license_tag TEXT NOT NULL,
    license_last4 VARCHAR(4) NOT NULL,
    license_expiry DATE NOT NULL,
    license_type VARCHAR(10),                   -- optional · 'LMV' | 'HMV'

    -- Additional
    driving_experience_years INTEGER,           -- optional
    previous_ambulance_experience BOOLEAN,      -- optional (Yes/No)

    -- Documents: base prefix + per-type path map (drivers/{ref}/{type}/{file})
    document_storage_path TEXT NOT NULL,
    documents JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Review workflow
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    reviewed_by VARCHAR(255),                   -- Clerk user id of the reviewing admin
    reviewed_at TIMESTAMP WITH TIME ZONE,

    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.driver_applications IS 'QSoS driver KYC applications (public submit, admin review)';
COMMENT ON COLUMN public.driver_applications.aadhaar_ciphertext IS 'AES-256-GCM ciphertext; decrypt app-side only, never log';
COMMENT ON COLUMN public.driver_applications.license_ciphertext IS 'AES-256-GCM ciphertext; decrypt app-side only, never log';

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_driver_applications_reference ON public.driver_applications(reference_number);
CREATE INDEX IF NOT EXISTS idx_driver_applications_status ON public.driver_applications(status);
CREATE INDEX IF NOT EXISTS idx_driver_applications_created_at ON public.driver_applications(created_at);
CREATE INDEX IF NOT EXISTS idx_driver_applications_email ON public.driver_applications(email);
CREATE INDEX IF NOT EXISTS idx_driver_applications_phone ON public.driver_applications(phone);

-- =============================================
-- UPDATED_AT TRIGGER
-- =============================================

DROP TRIGGER IF EXISTS update_driver_applications_updated_at ON public.driver_applications;
CREATE TRIGGER update_driver_applications_updated_at
    BEFORE UPDATE ON public.driver_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- REFERENCE-NUMBER GENERATOR  (QSO-DRV-YYYYMMDD-XXXX)
-- Atomic per-day sequence; concurrency-safe under serverless.
-- =============================================

CREATE TABLE IF NOT EXISTS public.driver_application_ref_counters (
    day DATE PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.driver_application_ref_counters IS 'Per-day sequence counter for driver application reference numbers';

CREATE OR REPLACE FUNCTION public.next_driver_application_ref()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    d   DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;  -- IST day boundary
    seq INTEGER;
BEGIN
    INSERT INTO public.driver_application_ref_counters (day, last_seq)
    VALUES (d, 1)
    ON CONFLICT (day)
    DO UPDATE SET last_seq = driver_application_ref_counters.last_seq + 1
    RETURNING last_seq INTO seq;

    RETURN 'QSO-DRV-' || to_char(d, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.next_driver_application_ref() IS 'Returns the next QSO-DRV-YYYYMMDD-XXXX reference (atomic, IST day)';

-- =============================================
-- SUBMISSION RATE LIMITER
-- Postgres-backed; counts hashed-IP attempts in a sliding window.
-- =============================================

CREATE TABLE IF NOT EXISTS public.submission_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_hash TEXT NOT NULL,                       -- sha256(ip); raw IP never stored
    scope VARCHAR(20) NOT NULL DEFAULT 'submit', -- 'submit' | 'upload'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_attempts_lookup
    ON public.submission_attempts (scope, ip_hash, created_at);

COMMENT ON TABLE public.submission_attempts IS 'Rate-limit ledger for public driver-application submit/upload (hashed IPs)';

CREATE OR REPLACE FUNCTION public.record_submission_attempt(
    p_ip_hash TEXT,
    p_scope   TEXT,
    p_limit   INTEGER,
    p_window  INTERVAL
)
RETURNS BOOLEAN  -- true = allowed, false = over the limit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recent INTEGER;
BEGIN
    SELECT count(*) INTO recent
    FROM public.submission_attempts
    WHERE scope = p_scope
      AND ip_hash = p_ip_hash
      AND created_at > now() - p_window;

    IF recent >= p_limit THEN
        RETURN false;
    END IF;

    INSERT INTO public.submission_attempts (ip_hash, scope) VALUES (p_ip_hash, p_scope);
    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.record_submission_attempt(TEXT, TEXT, INTEGER, INTERVAL) IS 'Atomically checks+records a rate-limit attempt; returns true if allowed';

-- =============================================
-- STORAGE BUCKET (private)
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-documents', 'driver-documents', false)
ON CONFLICT (id) DO NOTHING;
