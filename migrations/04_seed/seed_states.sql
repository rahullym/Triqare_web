-- =============================================
-- SEED DATA: STATES
-- =============================================
-- Auto-generated from existing database
-- Date: 2026-03-28T15:30:26.806Z
-- Total rows: 2

-- Clear existing data (optional - comment out if you want to preserve existing data)
-- TRUNCATE TABLE public.states CASCADE;

-- Insert data
INSERT INTO public.states (
    id,
    country_id,
    name
) VALUES
    ('bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', '65e677df-d1e3-48b8-801f-865c1035c6de', 'Kerala'),
    ('4d5aa3b0-3036-4ddf-8804-f04cf8fdc146', '65e677df-d1e3-48b8-801f-865c1035c6de', 'Maharashtra');

SELECT '✅ Inserted 2 rows into states' as status;
