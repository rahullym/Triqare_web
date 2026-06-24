-- =============================================
-- DRIVER APPLICATION — ADDRESS BIFURCATION + RELAXED MANDATORY FIELDS
-- Incremental patch to the live driver_applications table.
-- Apply like the other 99_updates patches.
-- =============================================
--
-- Changes:
--   1. Residential Address is split into Address + City + State + Pincode.
--      `address` keeps the street/house/area line; the three new columns hold
--      the rest. New columns are nullable so existing rows are untouched; the
--      application layer (src/lib/validation/driverApplication.ts) enforces them
--      as required for new submissions.
--   2. Ambulance Permit Number and License Type are now optional — drop their
--      NOT NULL constraints so submissions can omit them.
--   3. (No DB change needed for document uploads — they are gated entirely in the
--      app via REQUIRED_DOCUMENT_KEYS, now empty.)

-- 1. Address bifurcation
ALTER TABLE public.driver_applications
  ADD COLUMN IF NOT EXISTS city    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);

COMMENT ON COLUMN public.driver_applications.address IS 'Street / house / area line (City, State, Pincode are separate columns)';
COMMENT ON COLUMN public.driver_applications.city IS 'Required by the form; nullable for legacy rows predating the address split';
COMMENT ON COLUMN public.driver_applications.state IS 'Required by the form; nullable for legacy rows predating the address split';
COMMENT ON COLUMN public.driver_applications.pincode IS 'Required by the form (6 digits); nullable for legacy rows predating the address split';

-- 2. Make Ambulance Permit Number + License Type optional
ALTER TABLE public.driver_applications
  ALTER COLUMN ambulance_permit_number DROP NOT NULL,
  ALTER COLUMN license_type DROP NOT NULL;
