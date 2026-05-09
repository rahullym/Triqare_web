-- =============================================
-- SEED DATA: COUNTRIES
-- =============================================
-- Auto-generated from existing database
-- Date: 2026-03-28T15:30:26.391Z
-- Total rows: 3

-- Clear existing data (optional - comment out if you want to preserve existing data)
-- TRUNCATE TABLE public.countries CASCADE;

-- Insert data
INSERT INTO public.countries (
    id,
    name
) VALUES
    ('65e677df-d1e3-48b8-801f-865c1035c6de', 'india'),
    ('39e32f34-673d-48d7-b948-bf607e8f7b3a', 'Togo'),
    ('88654210-c319-4a94-9127-b9f200da7886', 'United Kingdom');

SELECT '✅ Inserted 3 rows into countries' as status;
