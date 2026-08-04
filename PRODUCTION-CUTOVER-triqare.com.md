# Production cutover — staging.triqare.com → triqare.com

Written 2026-07-31. Every fact below was verified live against DNS, the deployed
sites and the repo; nothing here is assumed.

---

## What this actually is

It is a **domain cutover, not a server or data migration.** Nothing moves.

There is exactly one backend:

| Thing | Value | Note |
|---|---|---|
| Database | Supabase `uwuwpfdhpoimvibunffz` | The **same** project the mobile app uses (`Triqare-app/.env`). There is no separate staging DB. |
| Web app + API | Netlify site `triqareweb20` | Runs Next.js, all `/api/*` routes, and the `expire-sos-requests` scheduled function. |
| `staging.triqare.com` | `CNAME → triqareweb20.netlify.app` | Just a custom-domain alias on that one site. |

So "moving staging to production" means: make `triqare.com` a second (and primary)
alias of the site that is already serving live traffic, then update the handful of
places the old hostname is baked in. No data is copied. No server is rebuilt.

### Two things found on the way that you should know about

**1. `portal.triqare.com` is a stale, separate deployment.**
It resolves to a *different* Netlify site (`triqareprod.netlify.app`) and still
serves the **old Clerk build** — its `/sign-in` HTML still references Clerk, while
`staging.triqare.com` has 0 Clerk references (the repo has 0 `@clerk` imports and no
Clerk dependency). Both sites talk to the same production database. Decide what
happens to it — see Step 7.

**2. `triqare.com` is not currently a site.** It is a Namecheap URL-forward:
`http://triqare.com` → `302` → `https://www.triqare.in/`, and `https://triqare.com`
does not complete a TLS handshake at all. Pointing the apex at Netlify therefore
does not take down a live site, but it **does end that forward to the marketing
site.** That is the one decision that has to be made before Step 1.

---

## Order of operations

Steps 1–5 make `triqare.com` live. Steps 6–8 are cleanup that can follow later —
none of them are required for the cutover, because `triqareweb20.netlify.app` keeps
resolving forever and everything baked against it keeps working.

---

### Step 1 — DNS at Namecheap

DNS is on Namecheap BasicDNS (`dns1/dns2.registrar-servers.com`).

> **Do not move the domain to Netlify DNS.** `triqare.com` carries live MX records
> (`mx1/mx2.privateemail.com`). Switching nameservers to Netlify drops them and takes
> company email down until they are hand-recreated. Keep DNS at Namecheap and add
> records only.

Decided: **both the apex and `www` serve the app**; the forward to `www.triqare.in`
is retired.

In Namecheap → Domain List → triqare.com → **Manage → Advanced DNS**:

> **Do the delete as its own save, before adding anything.** Namecheap will not let
> an `ALIAS` (or `CNAME`) coexist with a **URL Redirect Record** on the same host. If
> the redirect row is still present, the new record is rejected or overridden and the
> zone looks unchanged — which is exactly the failure seen on the first attempt
> (`http://triqare.com` still answering `302 → https://www.triqare.in/`).

1. In **HOST RECORDS**, delete the rows of type **URL Redirect Record** for host `@`
   and host `www` (bin icon on the right). Click **SAVE ALL CHANGES**.
   * If no such rows are visible, check the separate **REDIRECT DOMAIN** section
     further down the same page — on some accounts the forward lives there instead.
   * Confirm the delete actually took before continuing:
     ```bash
     curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://triqare.com
     # must NOT be 302 -> https://www.triqare.in/
     ```
2. Now add the records:

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | ALIAS Record | `@` | `triqareweb20.netlify.app` | Automatic |
   | CNAME Record | `www` | `triqareweb20.netlify.app` | Automatic |

   `ALIAS` is what makes the apex work — a plain `CNAME` on `@` is invalid and
   Namecheap will reject it.

   **Fallback if the ALIAS type is unavailable or won't save:** use Netlify's apex
   load balancer instead, which is supported for exactly this case —

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | A Record | `@` | `75.2.60.5` | Automatic |
   | CNAME Record | `www` | `triqareweb20.netlify.app` | Automatic |

   (Verified 2026-07-31: `apex-loadbalancer.netlify.com` → `75.2.60.5`. ALIAS is
   marginally preferable because it follows Netlify's failover, but the A record is
   fully supported.)
3. Click the green **✓** on each row, then **SAVE ALL CHANGES** — Namecheap does not
   save a row on focus-loss, which is a common way for edits to appear made but not
   persist.
3. **Leave the MX records and `staging.triqare.com` alone.** Keeping the staging
   CNAME means every existing bookmark, and the URLs baked into the shipped APKs,
   keep working through the transition.
4. `portal` is handled in Step 7 — delete that record too, but only once Step 5 has
   passed.

Propagation is usually minutes; allow up to an hour before assuming failure.

Worth telling whoever owns marketing: after this, nothing on `triqare.com` routes to
`triqare.in` any more. The `triqare.in` site itself is untouched and still reachable
directly (the mobile app and the site footer link to it for /contact and
/privacy-policy).

---

### Step 2 — Netlify: add the domain

Netlify → site `triqareweb20` → **Domain management**:

1. **Add custom domain** → `triqare.com`, then `www.triqare.com`.
2. Set `triqare.com` as the **primary domain**. Netlify will then 301 `www` and the
   other aliases to it.
3. Keep `staging.triqare.com` in the list as an alias — do not remove it yet.
4. Wait for **HTTPS / Let's Encrypt** to show a provisioned certificate. It will not
   issue until Step 1's DNS has propagated. If it stalls, use *Renew certificate*.

---

### Step 3 — Netlify: environment

The app's public origin is baked in at **build time** (`NEXT_PUBLIC_*`), so this
needs a redeploy, not just a variable change.

Set on the site (Site configuration → Environment variables):

```
NEXT_PUBLIC_APP_URL=https://triqare.com
```

Two notes:

* `.env.netlify` in this repo has been updated to the same value. If you import
  with `netlify env:import .env.netlify`, check what is already set on the site
  first — the file is a local copy and may have drifted from the dashboard.
* The old value was `triqareweb20.netlify.app` **with no scheme**, which is a live
  bug independent of this cutover: `src/lib/invitations.ts:39` concatenates it into
  `${APP_URL}/auth/callback`, producing a non-absolute URL that Supabase rejects as
  a redirect target, and `src/lib/email/sendApplicationEmails.ts:13` uses it for
  email links. Verify the value on Netlify actually starts with `https://`.

Then **Trigger deploy → Clear cache and deploy site**.

---

### Step 4 — Supabase Auth redirect configuration

This is the step that breaks sign-in if it is missed. Every auth entry point in the
app builds its callback from `window.location.origin`
(`SignInForm.tsx:24`, `SignUpForm.tsx:27`, `register/patient/page.tsx:146`,
`register/transport-company/page.tsx:129`, `auth/reset/page.tsx:83`), so the moment
users arrive on `triqare.com` the callback URL becomes `https://triqare.com/...` —
and Supabase refuses any redirect not on its allow-list.

Supabase dashboard → project `uwuwpfdhpoimvibunffz` → **Authentication → URL
Configuration**:

* **Site URL:** `https://triqare.com`
* **Redirect URLs** — add, keeping the existing entries during transition:
  * `https://triqare.com/**`
  * `https://www.triqare.com/**`

Leave `https://staging.triqare.com/**` in place until Step 8.

---

### Step 5 — Verify before announcing

```bash
# resolves to Netlify, not the old forward
dig +short triqare.com

# 200, and NOT a 302 to triqare.in
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://triqare.com

# valid certificate
curl -sI https://triqare.com | head -1
```

Then by hand, on `https://triqare.com`:

* Sign in as an existing admin → dashboard loads with data.
* Password reset → the OTP email arrives and the code is accepted.
* Google / Apple sign-in completes (this is what Step 4 protects).
* An emergency-contact invite email arrives and its link points at `triqare.com`.
* Raise a test SOS from the mobile app → a driver device gets the push. This proves
  the DB trigger still reaches the site (it posts to the `netlify.app` host, which
  is unaffected — you are confirming the cutover did not disturb it).

---

### Step 6 — (optional) Repoint the database triggers

The SOS push pipeline and the SOS-expiry sweep are Postgres triggers that POST to a
**hardcoded** host:

* `migrations/99_updates/FIX_2026-07-30_sos_dispatch_trigger.sql:51` →
  `https://triqareweb20.netlify.app/api/push/dispatch`
* `migrations/99_updates/FIX_2026-07-30_sos_expiry_pgcron.sql:71` →
  `https://triqareweb20.netlify.app/api/cron/expire-sos-requests`

These keep working after the cutover, because the `netlify.app` hostname does not go
away. Repointing them at `triqare.com` is cosmetic and carries real risk — it means
re-deploying the function that pages drivers during an emergency, and that function
has already gone silently dark twice (see the header comment in the dispatch
migration). **Recommendation: leave them until after the cutover has settled**, and
if you do change them, do it as its own change with a test SOS immediately after.

---

### Step 7 — Retire `portal.triqare.com`

Decided: retire it. It is a separate Netlify site (`triqareprod`) running the
superseded Clerk build against the live production database — a stale auth path into
real patient data, and a second copy of the app on the same DB.

Do this **after Step 5 passes**, so there is a known-good `triqare.com` first:

1. Netlify → site `triqareprod` → Domain management → remove `portal.triqare.com`.
2. Namecheap → Advanced DNS → delete the `portal` record.
3. Optionally delete or archive the `triqareprod` site itself so it cannot be
   redeployed by accident.

Safe to do: `Triqare-app/.env` has `EXPO_PUBLIC_API_URL=https://portal...`, but the
mobile code never reads it — `services/invite-service.ts:16` and
`services/feedback-service.ts:16` both read `EXPO_PUBLIC_WEB_API_URL` and fall back
to `https://triqareweb20.netlify.app`. Retiring `portal` does not affect the app.
Clear the dead `EXPO_PUBLIC_API_URL` line at the next mobile change so it stops
misleading (it is already commented as unused in `invite-service.ts`).

---

### Step 8 — (later) Mobile, once triqare.com is proven

The shipped APKs (through vc38) call `https://triqareweb20.netlify.app` for
emergency-contact invites and app feedback. That keeps working — **no rebuild is
required for this cutover.**

When you next build an APK anyway, set `EXPO_PUBLIC_WEB_API_URL=https://triqare.com`
in `Triqare-app/.env` so new builds use the production domain. Do not do this before
`triqare.com` is live and verified, or the new build ships pointing at a host that
does not answer.

Only after all of the above is proven should you drop `staging.triqare.com` from the
Netlify site and its Supabase redirect allow-list.

---

## Separate from the cutover, but do not ship without reading

`migrations/99_updates/FIX_2026-07-30_sos_dispatch_trigger.sql:52` contains the live
`dispatch_secret` in plaintext, and that file is **committed to
`github.com/triqare-coder/webapp_v2.0`, which is a public repository** (confirmed via
`gh repo view`). That secret is the only thing authenticating `/api/push/dispatch` —
the endpoint that sends push notifications to every driver and patient device.

Anyone who reads the public repo can page the entire fleet. Going to a production
domain does not change that, but it is worth fixing on the same pass: rotate the
secret, move it to a Netlify environment variable and a Postgres setting rather than
a literal in a tracked file, and purge the value from git history.
