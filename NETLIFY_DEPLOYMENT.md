# Netlify Deployment Guide

## Quick Fix for Current Error

The build was failing due to Netlify's secrets scanner detecting `NEXT_PUBLIC_SUPABASE_URL` in the build output. This is **expected and safe** because Next.js `NEXT_PUBLIC_*` variables are intentionally included in the client bundle.

### ✅ Fix Applied

Updated `netlify.toml` to tell Netlify to ignore these public environment variables:

```toml
SECRETS_SCAN_OMIT_KEYS = "NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
```

## Environment Variables Setup

### Required Environment Variables in Netlify

Go to **Site Settings → Build & Deploy → Environment** and add these variables:

#### 1. Clerk Authentication
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
```

#### 2. Supabase Database
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

#### 3. Google Maps API
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

### Security Notes

**Public Variables (Safe in Client Bundle):**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (protected by RLS)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Maps API key (restrict by domain)

**Private Variables (Server-Only):**
- `CLERK_SECRET_KEY` - Never exposed to client
- `CLERK_WEBHOOK_SECRET` - Never exposed to client
- `SUPABASE_SERVICE_ROLE_KEY` - Never exposed to client (bypasses RLS)

## Deployment Steps

### 1. Commit and Push Changes
```bash
git add netlify.toml .env.example NETLIFY_DEPLOYMENT.md
git commit -m "Fix Netlify secrets scanner configuration"
git push
```

### 2. Configure Environment Variables in Netlify
- Go to your Netlify site dashboard
- Navigate to **Site Settings → Build & Deploy → Environment**
- Click **Add a variable** for each required variable
- Copy values from your local `.env.local` file

### 3. Trigger Deployment
- Netlify will automatically deploy on push
- Or manually trigger: **Deploys → Trigger deploy → Deploy site**

### 4. Verify Deployment
- Check build logs for any errors
- Visit your deployed site URL
- Test authentication and database connectivity

## Troubleshooting

### Build Still Fails with Secrets Error
1. Verify `SECRETS_SCAN_OMIT_KEYS` is in `netlify.toml`
2. Ensure no `.env` files are committed to git
3. Check that environment variables are set in Netlify UI

### Environment Variables Not Working
1. Verify variable names match exactly (case-sensitive)
2. Check for typos in variable values
3. Redeploy after adding/updating variables

### Database Connection Fails
1. Verify Supabase URL and keys are correct
2. Check Supabase RLS policies are configured
3. Ensure migrations have been run on Supabase

### Clerk Authentication Fails
1. Verify Clerk keys are correct
2. Check Clerk dashboard for allowed domains
3. Add your Netlify domain to Clerk's allowed origins

## Post-Deployment Checklist

- [ ] All environment variables configured in Netlify
- [ ] Build completes successfully
- [ ] Site loads without errors
- [ ] Authentication works (Clerk sign-in/sign-up)
- [ ] Database connectivity works (Supabase)
- [ ] Google Maps loads correctly
- [ ] All role-based dashboards accessible
- [ ] Webhook endpoint configured in Clerk dashboard

## Additional Resources

- [Netlify Environment Variables](https://docs.netlify.com/environment-variables/overview/)
- [Netlify Secrets Scanning](https://ntl.fyi/configure-secrets-scanning)
- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Supabase RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)

