# Supabase Auth email templates

Version-controlled copies of the Auth email bodies that live in the Supabase
Dashboard (Authentication → Emails). Editing a file here changes nothing on its
own — it has to be pushed to the project.

## Why these exist

The password-reset email used to send `{{ .ConfirmationURL }}` (a link). Both
clients ask the user to type the emailed code instead — 8 digits, per the
project's Auth → Email OTP Length setting:

| client | screen | call |
| --- | --- | --- |
| mobile | `Triqare-app/app/(auth)/forgot-password.tsx` | `verifyOtp({ type: 'recovery' })` |
| web | `web-production/src/app/auth/reset/page.tsx` | `verifyOtp({ type: 'recovery' })` |

So `recovery.html` must keep `{{ .Token }}`. A link-only template leaves both
clients waiting for a code that never arrives.

## Applying

Either paste the file into Dashboard → Authentication → Emails → **Reset
Password** (subject: `Your Triqare password reset code`), or push it:

```bash
cd web-production
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-auth-email-templates.js --dry-run  # inspect live
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-auth-email-templates.js            # apply
```

The token is a personal access token (Dashboard → Account → Access Tokens); the
project ref is read from `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`.

## Notes

- `recovery.html` says the code expires in 1 hour, which matches the default
  email OTP expiry. If Authentication → Sign In / Providers → Email OTP expiry is
  changed, change the copy too.
- Mobile sign-up (`Triqare-app/app/(auth)/sign-up.tsx`) verifies with
  `type: 'signup'` and has the same requirement on the **Confirm signup**
  template — not covered by a file here yet.
