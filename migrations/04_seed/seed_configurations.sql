-- =============================================
-- SEED DATA: CONFIGURATIONS
-- =============================================
-- Auto-generated from existing database
-- Date: 2026-03-28T15:30:26.601Z
-- Total rows: 2

-- Clear existing data (optional - comment out if you want to preserve existing data)
-- TRUNCATE TABLE public.configurations CASCADE;

-- Insert data
INSERT INTO public.configurations (
    key,
    value,
    created_at,
    updated_at
) VALUES
    ('driver_sos_request_radius_km', '100000000000km', '2025-11-22T19:34:13.180488+00:00', '2026-01-31T11:29:32.322+00:00'),
    ('sos_request_timeout_minutes', '3', '2026-01-05T18:25:35.423126+00:00', '2026-01-05T18:25:35.423126+00:00');

SELECT '✅ Inserted 2 rows into configurations' as status;
