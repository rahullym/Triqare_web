-- =============================================
-- SEED DATA: CITIES
-- =============================================
-- Auto-generated from existing database
-- Date: 2026-03-28T15:30:27.021Z
-- Total rows: 12

-- Clear existing data (optional - comment out if you want to preserve existing data)
-- TRUNCATE TABLE public.cities CASCADE;

-- Insert data
INSERT INTO public.cities (
    id,
    state_id,
    name
) VALUES
    ('a1e0eb3b-da44-4bb4-b165-48ea16394b70', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Alappuzha'),
    ('0a7e765c-103c-459b-aaab-e5394c1f6f6f', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Ernakulam'),
    ('4cf3d6c0-087a-4dcf-83e0-02f9a6279f3f', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Kottayam'),
    ('5a819136-0c8d-4c10-bbd6-39767f4a0dac', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Kozhikode'),
    ('276b2858-6d9d-473a-8ba6-8acdbbd053d9', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Malappuram'),
    ('cc5e4952-2b87-4118-b28e-712ce501eb12', '4d5aa3b0-3036-4ddf-8804-f04cf8fdc146', 'Mumbai'),
    ('e5f3cb95-1a66-4d6e-af1c-34dab1186729', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Palakkad'),
    ('ae34fa4c-c5dd-4528-8bf0-82f52d4e6e42', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Pathanamthitta'),
    ('bede4be2-70f3-4250-8f14-4f8cfe7587c1', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Thiruvananthapuram'),
    ('f114522e-f906-4a64-9a6c-cd0b347b3c0d', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Thrissur'),
    ('96eb281f-d5ff-4c1c-a87f-5e2d9d419d4c', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Wadakancherry'),
    ('f9b4bb8e-b38a-4257-8dc8-bc051784a156', 'bd2f33bd-8b9a-47ac-96e8-e594aa4a9e91', 'Wayanad');

SELECT '✅ Inserted 12 rows into cities' as status;
