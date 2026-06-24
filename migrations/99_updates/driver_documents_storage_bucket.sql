-- Driver KYC document storage bucket
--
-- Private bucket holding applicant documents under
--   drivers/{reference_number}/{document_type}/{filename}
-- with in-flight uploads under drivers/_drafts/{draftId}/...
--
-- Public applicants never authenticate against this bucket directly: the API
-- (using the SERVICE ROLE key) mints short-lived signed upload URLs and the
-- browser PUTs the file to that URL. The signed-URL token authorises the write,
-- so NO anon storage RLS policy is required here — the bucket just has to exist.
--
-- IMPORTANT: this only works when SUPABASE_SERVICE_ROLE_KEY is the real
-- service_role secret (not the anon key). With the anon key, createSignedUploadUrl
-- is blocked by RLS (403) and every upload fails.
--
-- Idempotent: safe to re-run.
insert into storage.buckets (id, name, public, file_size_limit)
values ('driver-documents', 'driver-documents', false, 10485760) -- 10 MB, matches MAX_FILE_BYTES
on conflict (id) do nothing;
