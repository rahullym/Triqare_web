# API Integrations & User Workflow Documentation

**System**: Emergency Response Management System  
**Stack**: Next.js 15 · TypeScript · Supabase · Clerk · Google Maps  
**Last Updated**: April 2026

---

## Table of Contents

1. [API Integrations](#1-api-integrations)
   - [Clerk (Authentication)](#11-clerk-authentication)
   - [Supabase (Database & Realtime)](#12-supabase-database--realtime)
   - [Google Maps API](#13-google-maps-api)
   - [Internal REST API (144 Endpoints)](#14-internal-rest-api)
2. [User Workflows](#2-user-workflows)
   - [Patient Registration & Login](#21-patient-registration--login)
   - [SOS Emergency Request](#22-sos-emergency-request)
   - [Driver Management](#23-driver-management)
   - [Hospital Directory](#24-hospital-directory)
   - [Billing & Subscriptions](#25-billing--subscriptions)
   - [ERT Assignment Workflow](#26-ert-assignment-workflow)
   - [Location Hierarchy Management](#27-location-hierarchy-management)
   - [Admin & Sync Operations](#28-admin--sync-operations)
3. [Real-time Architecture](#3-real-time-architecture)
4. [Background Jobs & Cron Tasks](#4-background-jobs--cron-tasks)
5. [Data Import / Export](#5-data-import--export)
6. [Security & RBAC](#6-security--rbac)
7. [Environment Variables](#7-environment-variables)
8. [Database Schema Overview](#8-database-schema-overview)

---

## 1. API Integrations

### 1.1 Clerk (Authentication)

**Purpose**: User identity, session management, role metadata, and webhook-driven sync.

| Item | Value |
|------|-------|
| SDK | `@clerk/nextjs` |
| Webhook endpoint | `POST /api/webhooks/clerk` |
| Env vars | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` |

**Webhook events handled** (`src/app/api/webhooks/clerk/route.ts`):

| Event | Action |
|-------|--------|
| `user.created` | Creates Supabase user record; assigns default `patient` role; checks pending CSV imports |
| `user.updated` | Syncs profile changes (name, email, metadata) to Supabase |
| `user.deleted` | Marks user `is_active = false` in Supabase |

**Role storage**: Clerk public metadata (`role` field) stays in sync with `users.role` in Supabase via `autoSyncService.ts`.

**Auth guard pattern** (server-side):
```typescript
import { auth } from '@clerk/nextjs/server';
const { userId } = await auth();
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

---

### 1.2 Supabase (Database & Realtime)

**Purpose**: Primary data store (PostgreSQL), row-level security, and live data push.

| Item | Value |
|------|-------|
| SDK | `@supabase/supabase-js` |
| URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Client key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-side, RLS enforced) |
| Service key | `SUPABASE_SERVICE_ROLE_KEY` (server-side only, bypasses RLS) |
| Client setup | `src/lib/supabase.ts` (browser), `src/lib/supabase/server.ts` (server) |

**Realtime subscriptions** (Supabase Channels):

| Hook | Table | Events | Used By |
|------|-------|--------|---------|
| `useSOSRequestsRealtime` | `sos_requests` | INSERT, UPDATE, DELETE | ERT Dashboard |
| `useDriversRealtime` | `drivers` | UPDATE | Dispatch map |
| `useNotificationsRealtime` | `notifications` | INSERT | All dashboards |
| `useUsersRealtime` | `users` | INSERT, UPDATE | Admin dashboard |
| `useERTDriversRealtime` | `drivers` + `sos_request_assigned` | UPDATE | ERT assignments |

All realtime hooks auto-unsubscribe on component unmount and expose a `connectionStatus` flag.

---

### 1.3 Google Maps API

**Purpose**: Hospital location search, geocoding, distance calculations.

| Item | Value |
|------|-------|
| Env var | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Scrape endpoint | `POST /api/hospitals/scrape-google` (admin only) |
| Response format | Server-Sent Events (SSE) streaming progress |

**Scraping workflow**:
1. Admin provides search location + radius
2. Backend calls Google Places API
3. Results stream back in real-time via SSE
4. Each hospital is mapped to Supabase country/state/city/pincode hierarchy
5. Duplicates are detected and skipped

---

### 1.4 Internal REST API

All endpoints are under `src/app/api/`. Response shape conventions:

```typescript
// Success
{ data: T, success: true }

// Error
{ error: string, success: false, details?: string }

// Paginated list
{ data: T[], count: number, limit: number, offset: number }
```

#### SOS Requests (`/api/sos-requests/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sos-requests` | List all SOS requests (filterable by status) |
| POST | `/api/sos-requests` | Create a new emergency request |
| GET | `/api/sos-requests/[id]` | Get single request details |
| PATCH | `/api/sos-requests/[id]/status` | Update request status |
| POST | `/api/sos-requests/[id]/assign` | Manually assign a driver |
| GET | `/api/sos-requests/available-drivers` | List available drivers near location |
| POST | `/api/sos-requests/assign-driver` | Auto-assign nearest available driver |

#### Drivers (`/api/drivers/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/drivers` | List drivers (filter: status, company) |
| POST | `/api/drivers` | Create driver profile |
| GET | `/api/drivers/[id]` | Get driver details |
| PATCH | `/api/drivers/[id]` | Update driver profile |
| POST | `/api/drivers/[id]/location` | Update GPS coordinates |
| POST | `/api/drivers/upload-csv` | Bulk import drivers |
| GET | `/api/drivers/stats` | Performance metrics |

#### Patients (`/api/patients/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patients` | List patients (paginated) |
| POST | `/api/patients` | Create patient profile |
| GET | `/api/patients/[id]` | Get patient details |
| PATCH | `/api/patients/[id]` | Update patient profile |
| POST | `/api/patients/upload-csv` | Bulk import patients |

#### Hospitals (`/api/hospitals/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hospitals` | List hospitals (filter by country/state) |
| POST | `/api/hospitals` | Create hospital record |
| GET | `/api/hospitals/[id]` | Get hospital details |
| PATCH | `/api/hospitals/[id]` | Update hospital |
| GET | `/api/hospitals/search` | Text search by name |
| POST | `/api/hospitals/scrape-google` | Scrape from Google (SSE stream) |
| POST | `/api/hospitals/upload-csv` | Bulk import hospitals |

#### Locations (`/api/locations/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/locations/countries` | Country management |
| GET/POST | `/api/locations/states` | State management |
| GET/POST | `/api/locations/cities` | City management |
| GET/POST | `/api/locations/pincodes` | Pincode management |
| POST | `/api/locations/[entity]/upload-csv` | Bulk import per level |
| GET | `/api/locations/bulk-export` | Export full hierarchy |

#### Users & Auth (`/api/users/*`, `/api/profile`, `/api/register/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List users (filter by role) |
| GET | `/api/users/[id]` | Get user profile |
| PATCH | `/api/users/[id]` | Update user |
| GET | `/api/profile` | Get current authenticated user |
| POST | `/api/register/patient` | Patient self-registration |
| POST | `/api/register/transport-company` | Company registration |

#### Subscriptions & Billing (`/api/subscription-plans/*`, `/api/patient-subscriptions/*`, `/api/billing-history/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/subscription-plans` | List available plans |
| POST | `/api/subscription-plans` | Create a plan (admin) |
| GET | `/api/patient-subscriptions` | List patient subscriptions |
| POST | `/api/patient-subscriptions` | Subscribe a patient |
| GET | `/api/billing-history/[id]` | Get billing history |

#### ERT Team (`/api/erteam/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/erteam/assignments` | List active SOS assignments |
| GET | `/api/erteam/dashboard/stats` | ERT performance metrics |

#### Admin (`/api/admin/*`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/setup-database` | Initialize schema |
| POST | `/api/admin/setup-users-table-rls` | Configure RLS policies |
| POST | `/api/admin/sync` | Full data sync |
| POST | `/api/admin/auto-sync` | Background auto-sync |
| GET | `/api/admin/sync-report` | Sync status report |
| POST | `/api/admin/sync-clerk-to-tables` | Clerk → Supabase sync |
| GET | `/api/admin/dashboard/stats` | System-wide statistics |
| GET | `/api/admin/analytics/comprehensive` | Detailed analytics |
| POST | `/api/admin/cleanup-user-records` | Remove orphaned records |
| POST | `/api/admin/migrate-users` | Bulk user migration |

#### Webhooks & Cron

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/clerk` | Clerk user lifecycle events |
| GET/POST | `/api/cron/sync-users` | Scheduled Clerk ↔ Supabase sync |

---

## 2. User Workflows

### 2.1 Patient Registration & Login

**Registration** (`POST /api/register/patient`):

```
1. Patient signs up via Clerk (email/password or OAuth)
2. Clerk fires user.created webhook
3. Webhook handler creates users record (role = 'patient')
4. Patient completes profile form:
   - Personal: name, DOB, gender, address
   - Medical: blood type, conditions, allergies, medications
   - Emergency contacts (name, phone, relationship)
   - Insurance: provider, policy number
5. POST /api/register/patient → creates patients record
6. Patient redirected to /patient/sos dashboard
```

**Login**:
```
1. User authenticates via Clerk
2. Clerk returns session token
3. useCurrentUser hook fetches profile from /api/profile
4. useRole hook reads role from Clerk metadata
5. User redirected to role-specific dashboard
```

**Role → Dashboard mapping**:

| Role | Dashboard |
|------|-----------|
| `admin` | `/admin/dashboard` |
| `ert` | `/erteam/dashboard` |
| `transport_company` | `/transport/dashboard` |
| `driver` | `/driver/dashboard` |
| `patient` | `/patient/sos` |

---

### 2.2 SOS Emergency Request

**Status lifecycle**:
```
SOS Triggered → Driver En Route → Transport Arrived → User Picked Up → Arrived at Hospital
                                                              ↓
                                                          Cancelled (any stage)
```

**Patient side** (`/patient/sos`):
```
1. Patient taps "SOS" button
2. Browser requests GPS location
3. Patient selects destination hospital (optional)
4. POST /api/sos-requests with:
   - patient_id, location (lat/lng), destination_hospital_id
5. System attempts auto-assignment:
   a. GET /api/sos-requests/available-drivers
   b. POST /api/sos-requests/assign-driver (nearest driver selected)
6. Emergency contacts are notified
7. Patient sees real-time status via useSOSRequestsRealtime hook
8. Audio alert fires when driver status changes
```

**ERT/Dispatch side** (`/erteam/assignments`):
```
1. New SOS appears in real-time on ERT dashboard (audio alert)
2. ERT reviews: patient info, location, available drivers
3. Options:
   a. Accept auto-assignment (confirm nearest driver)
   b. Manual override: POST /api/sos-requests/[id]/assign
4. Driver notified via notifications system
5. ERT tracks status updates in real-time
6. PATCH /api/sos-requests/[id]/status at each stage
```

**Driver side**:
```
1. Driver receives assignment notification
2. Driver accepts/declines
3. Driver updates GPS: POST /api/drivers/[id]/location
4. Status transitions tracked in sos_request_assigned table
```

---

### 2.3 Driver Management

**Transport company adds driver**:
```
1. Company dashboard → Drivers → Add Driver
2. Form: personal info, license details, medical cert, vehicle assignment
3. POST /api/drivers (creates users + drivers records)
4. Clerk account created; driver receives invite email
5. Driver appears in company fleet list
```

**Bulk import**:
```
1. Upload CSV via /api/drivers/upload-csv
2. CSV parsed → records queued in pending_csv_imports
3. Clerk sends invite emails to each driver
4. On account creation, webhook links driver to pending import
```

**Driver status states**:

| Status | Meaning |
|--------|---------|
| `available` | Ready to be assigned |
| `assigned` | Has an active SOS assignment |
| `on_trip` | Currently transporting patient |
| `inactive` | Off duty or suspended |

---

### 2.4 Hospital Directory

**Adding hospitals manually**:
```
1. Admin/ERT → Hospitals → Add Hospital
2. POST /api/hospitals with type, contact, hours, coordinates
3. Location hierarchy linked (country → state → city → pincode)
```

**Google scraping** (admin only):
```
1. Admin opens Hospital Scraper tool
2. Enters search location + radius (km)
3. POST /api/hospitals/scrape-google
4. SSE stream shows progress in real-time:
   - "Searching for hospitals in {city}..."
   - "Found 12 hospitals, processing..."
   - "Saved: {hospital name}"
5. Duplicates automatically skipped
6. Results visible in hospital directory immediately
```

**Bulk CSV upload**:
```
POST /api/hospitals/upload-csv
→ Validates headers and required fields
→ Maps to location hierarchy
→ Returns imported count + error rows
```

**Hospital status values**: `active`, `inactive`, `under_review`, `suspended`

---

### 2.5 Billing & Subscriptions

**Plan setup** (admin):
```
1. Admin → Accounting → Subscription Plans
2. POST /api/subscription-plans (name, price, features, duration)
```

**Patient subscribes**:
```
1. Patient → Account → Plans
2. GET /api/subscription-plans → display available plans
3. Patient selects plan
4. POST /api/patient-subscriptions
5. Subscription record created with start/end dates
6. Billing entry created in billing_history
```

**Billing history**:
```
GET /api/billing-history/[patientId]
→ Returns all transactions: date, amount, plan, status
```

---

### 2.6 ERT Assignment Workflow

```
1. ERT member logs in → /erteam/dashboard
2. Dashboard shows:
   - Active SOS count (real-time)
   - Available driver count (real-time)
   - Pending assignments queue
3. ERT views SOS request details:
   - Patient info + medical profile
   - GPS location on map
   - Nearest available drivers
4. Assignment options:
   a. Auto-assign: system picks nearest driver
   b. Manual assign: ERT selects specific driver
5. Driver receives notification
6. ERT monitors trip progress via real-time status updates
7. Trip completion triggers billing (if applicable)
```

**Dashboard stats** (`GET /api/erteam/dashboard/stats`):
- Total active requests
- Average response time
- Driver availability rate
- Completed trips today/week/month

---

### 2.7 Location Hierarchy Management

**4-level hierarchy**: Country → State → City → Pincode

**Manual entry**:
```
POST /api/locations/countries   → { name, code, phone_code }
POST /api/locations/states      → { name, country_id }
POST /api/locations/cities      → { name, state_id }
POST /api/locations/pincodes    → { code, city_id, lat, lng }
```

**Bulk import**:
```
POST /api/locations/countries/upload-csv
POST /api/locations/states/upload-csv
POST /api/locations/cities/upload-csv
POST /api/locations/pincodes/upload-csv
```

**Export all**:
```
GET /api/locations/bulk-export → full hierarchy as CSV/JSON
```

---

### 2.8 Admin & Sync Operations

**Initial setup sequence** (one-time):
```
1. POST /api/admin/setup-database          → create all tables
2. POST /api/admin/setup-users-table-rls   → apply RLS policies
3. POST /api/admin/setup-pending-imports-table → CSV import infra
4. POST /api/admin/sync-clerk-to-tables    → import existing Clerk users
```

**Ongoing sync**:
```
Automatic (webhook-driven):
  user.created / user.updated / user.deleted → real-time sync

Scheduled (cron):
  GET /api/cron/sync-users → catches any missed webhook events

Manual (admin panel):
  POST /api/admin/sync → force full sync
  GET /api/admin/sync-report → view last sync status
```

---

## 3. Real-time Architecture

```
PostgreSQL (Supabase)
       │
       ▼ Change Events (INSERT / UPDATE / DELETE)
Supabase Realtime Server
       │
       ▼ WebSocket Channel
Client-side Hook (e.g. useSOSRequestsRealtime)
       │
       ├── Updates React state (re-renders dashboard)
       └── Fires Web Audio API alert (new emergencies)
```

**Connection pattern** (all realtime hooks):
```typescript
const channel = supabase
  .channel('sos-requests-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_requests' }, handler)
  .subscribe((status) => setConnectionStatus(status));

return () => supabase.removeChannel(channel); // cleanup
```

---

## 4. Background Jobs & Cron Tasks

### User Sync Cron (`GET /api/cron/sync-users`)

**Purpose**: Catches users who exist in Supabase but weren't synced to Clerk (e.g., after a webhook failure).

**Response**:
```json
{
  "success": true,
  "timestamp": "2026-04-12T10:30:00Z",
  "synced_users": 5,
  "errors": [],
  "message": "Cron sync completed: 5 users synced"
}
```

**Security**: Pass `CRON_SECRET` as `Authorization: Bearer {secret}` header.

**Recommended schedule**: Every 5–10 minutes via Vercel Cron, GitHub Actions, or external scheduler.

### Vercel Cron config example (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-users",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## 5. Data Import / Export

| Operation | Endpoint | Accepted Format |
|-----------|----------|-----------------|
| Import drivers | `POST /api/drivers/upload-csv` | CSV |
| Import patients | `POST /api/patients/upload-csv` | CSV |
| Import hospitals | `POST /api/hospitals/upload-csv` | CSV |
| Import transport companies | `POST /api/transport-companies/upload-csv` | CSV |
| Import countries | `POST /api/locations/countries/upload-csv` | CSV |
| Import states | `POST /api/locations/states/upload-csv` | CSV |
| Import cities | `POST /api/locations/cities/upload-csv` | CSV |
| Import pincodes | `POST /api/locations/pincodes/upload-csv` | CSV |
| Export locations | `GET /api/locations/bulk-export` | CSV / JSON |

**Import flow**:
```
Upload CSV → Parse + Validate → Insert records → Queue in pending_csv_imports
         → (if users) Trigger Clerk invite emails
         → Clerk webhook links invite to pending_csv_imports on account creation
```

---

## 6. Security & RBAC

### Roles

| Role | Access Level |
|------|-------------|
| `admin` | Full system access, user management, analytics, setup |
| `ert` | Emergency operations, driver assignment, SOS management |
| `transport_company` | Manage own drivers, view company assignments |
| `driver` | View own assignments, update location |
| `patient` | Create SOS requests, view own history, manage subscription |

### Enforcement layers

1. **Clerk middleware** — session validation on all requests
2. **API route guards** — `auth()` check + role verification in every handler
3. **Database RLS** — row-level policies restrict queries per role/user
4. **Frontend hooks** — `useRole()` hides UI elements for unauthorized roles

### Security headers (`next.config.js`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
```

### Key security rules
- `SUPABASE_SERVICE_ROLE_KEY` is **server-side only** — never exposed to client
- `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` are **server-side only**
- All public env vars (`NEXT_PUBLIC_*`) are safe for client exposure
- Webhook requests verified via Clerk signature before processing

---

## 7. Environment Variables

| Variable | Side | Required | Purpose |
|----------|------|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client | Yes | Clerk auth init |
| `CLERK_SECRET_KEY` | Server | Yes | Clerk API calls |
| `CLERK_WEBHOOK_SECRET` | Server | Yes | Webhook signature verification |
| `NEXT_PUBLIC_SUPABASE_URL` | Client | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | Yes | Client-side DB access (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Yes | Admin DB access (bypasses RLS) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client | For scraping | Hospital geo search |
| `CRON_SECRET` | Server | Recommended | Secure cron endpoint |

---

## 8. Database Schema Overview

### Table dependency order (for migrations)

```
Level 0:  users, countries, configurations, subscription_plans, announcements
Level 1:  states, notifications, transport_companies
Level 2:  cities, drivers
Level 3:  pincodes, hospitals
Level 4:  patients
Level 5:  emergency_contacts, sos_requests, patient_subscriptions
Level 6:  sos_request_assigned, billing_history, pending_csv_imports
```

### Key relationships

```
users (1) ──► (1) patients
      (1) ──► (1) drivers
      (1) ──► (1) transport_companies

patients (1) ──► (many) emergency_contacts
         (1) ──► (many) sos_requests
         (1) ──► (many) patient_subscriptions

drivers (many) ──► (1) transport_companies
        (1)    ──► (many) sos_request_assigned

sos_requests (1) ──► (1) hospitals        [destination]
             (1) ──► (1) patients
             (1) ──► (many) sos_request_assigned

patient_subscriptions (1) ──► (many) billing_history
```

### SOS request status field values

| Value | Description |
|-------|-------------|
| `sos_triggered` | Request created, awaiting driver |
| `driver_en_route` | Driver assigned and en route |
| `transport_arrived` | Driver at patient location |
| `user_picked_up` | Patient in vehicle |
| `arrived_at_hospital` | Trip complete |
| `cancelled` | Cancelled at any stage |

### Driver status field values

| Value | Description |
|-------|-------------|
| `available` | Ready to accept assignments |
| `assigned` | Has active assignment |
| `on_trip` | Currently transporting patient |
| `inactive` | Offline / suspended |

---

*For database schema DDL, see [`DATABASE_SCHEMA_DOCUMENTATION.md`](DATABASE_SCHEMA_DOCUMENTATION.md).*  
*For deployment instructions, see [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md).*  
*For role-specific feature details, see [`ROLE_FUNCTIONALITY_GUIDE.md`](ROLE_FUNCTIONALITY_GUIDE.md).*
