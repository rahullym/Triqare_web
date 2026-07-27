  -- =============================================================================
  -- FIX: emergency-contact SOS notifications (email + app push) — 2026-07-27
  -- Root cause: prod notify_push_on_sos_change() still had the PLACEHOLDER secret,
  -- so the guard returned NULL and the trigger NEVER POSTed to /api/push/dispatch.
  -- Both channels (email + push) branch off that POST, so both were silent.
  -- Run the WHOLE file in the Supabase SQL editor. Idempotent; safe to re-run.
  -- =============================================================================

  -- ---------------------------------------------------------------------------
  -- STEP 1 — Wire the dispatch trigger with the REAL secret (unblocks email+push)
  -- ---------------------------------------------------------------------------
  CREATE OR REPLACE FUNCTION public.notify_push_on_sos_change()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  DECLARE
    dispatch_url    text := 'https://triqareweb20.netlify.app/api/push/dispatch';
    dispatch_secret text := 'aff09a5fc2b78aeac9aaa76abf114e567cd754b9ca732c6f6b4f1c8a46499605';
    prev_status    text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;
    prev_driver_id uuid := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.driver_id END;
  BEGIN
    IF dispatch_url IS NULL OR dispatch_url = ''
      OR dispatch_secret = 'REPLACE_WITH_PUSH_DISPATCH_SECRET' THEN
      RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NULL;
    END IF;

    PERFORM net.http_post(
      url     := dispatch_url,
      headers := jsonb_build_object('Content-Type','application/json',
                                    'Authorization','Bearer ' || dispatch_secret),
      body    := jsonb_build_object('request_id', NEW.id, 'old_status', prev_status,
                  'new_status', NEW.status, 'old_driver_id', prev_driver_id,
                  'new_driver_id', NEW.driver_id),
      timeout_milliseconds := 5000
    );
    RETURN NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_push_on_sos_change failed for sos_request %: %', NEW.id, SQLERRM;
    RETURN NULL;
  END;
  $function$;

  DROP TRIGGER IF EXISTS trg_notify_push_on_sos_change ON public.sos_requests;
  CREATE TRIGGER trg_notify_push_on_sos_change
    AFTER INSERT OR UPDATE OF status ON public.sos_requests
    FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_sos_change();

  -- ---------------------------------------------------------------------------
  -- STEP 2 — Link emergency contacts to accounts by email (unblocks APP push)
  --          (adds contact_user_id + auto-resolve triggers + backfills existing)
  -- ---------------------------------------------------------------------------
  ALTER TABLE public.emergency_contacts
    ADD COLUMN IF NOT EXISTS contact_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_emergency_contacts_contact_user_id
    ON public.emergency_contacts(contact_user_id);

  CREATE OR REPLACE FUNCTION public.resolve_emergency_contact_user()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
      NEW.contact_user_id := NULL;
    ELSE
      SELECT u.id INTO NEW.contact_user_id
        FROM public.users u
      WHERE lower(u.email) = lower(btrim(NEW.email)) LIMIT 1;
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_resolve_emergency_contact_user ON public.emergency_contacts;
  CREATE TRIGGER trg_resolve_emergency_contact_user
    BEFORE INSERT OR UPDATE OF email ON public.emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION public.resolve_emergency_contact_user();

  CREATE OR REPLACE FUNCTION public.backfill_emergency_contact_links()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
      UPDATE public.emergency_contacts ec
        SET contact_user_id = NEW.id
      WHERE lower(ec.email) = lower(btrim(NEW.email))
        AND ec.contact_user_id IS DISTINCT FROM NEW.id;
    END IF;
    RETURN NULL;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_backfill_emergency_contact_links ON public.users;
  CREATE TRIGGER trg_backfill_emergency_contact_links
    AFTER INSERT OR UPDATE OF email ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.backfill_emergency_contact_links();

  UPDATE public.emergency_contacts ec
    SET contact_user_id = u.id
    FROM public.users u
  WHERE ec.email IS NOT NULL
    AND lower(u.email) = lower(btrim(ec.email))
    AND ec.contact_user_id IS DISTINCT FROM u.id;

  -- ---------------------------------------------------------------------------
  -- STEP 3 — Verify data state (read-only)
  -- ---------------------------------------------------------------------------
  SELECT count(*) FILTER (WHERE email IS NOT NULL)            AS contacts_with_email,
        count(*) FILTER (WHERE contact_user_id IS NOT NULL)  AS contacts_linked_to_account,
        count(*)                                             AS total_contacts
  FROM public.emergency_contacts;
