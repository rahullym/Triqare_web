import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { REFERENCE_NUMBER_RE } from '@/lib/referenceNumber'
import { DOCUMENT_TYPE_KEYS } from '@/lib/storage/driverDocuments'

// ---- shared mock state (hoisted so vi.mock factories can see it) -----------
const h = vi.hoisted(() => {
  const inserted: Record<string, unknown>[] = []

  function listBuilder() {
    const builder: Record<string, unknown> = {
      order: () => builder,
      eq: () => builder,
      or: () => builder,
      neq: () => builder,
      maybeSingle: () => Promise.resolve({ data: inserted[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: inserted, error: null }),
    }
    return builder
  }

  const fakeSupabase = {
    rpc: (name: string) =>
      name === 'next_driver_application_ref'
        ? Promise.resolve({ data: 'QSO-DRV-20260610-0001', error: null })
        : Promise.resolve({ data: true, error: null }), // record_submission_attempt
    storage: {
      from: () => ({
        move: () => Promise.resolve({ error: null }),
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: 'https://signed.example/doc' }, error: null }),
      }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: 'app-1', reference_number: row.reference_number },
                error: null,
              }),
          }),
        }
      },
      select: () => listBuilder(),
    }),
  }

  const emailSpy = vi.fn(() => Promise.resolve())
  return { inserted, fakeSupabase, emailSpy }
})

vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => h.fakeSupabase }))
vi.mock('@/lib/email/sendApplicationEmails', () => ({ sendSubmissionEmails: h.emailSpy }))
vi.mock('@/lib/crypto/fieldEncryption', () => ({
  encryptField: () => ({ ciphertext: 'cipher', iv: 'iv', tag: 'tag' }),
  last4: (v: string) => v.slice(-4),
}))

// import AFTER mocks
import { POST } from '@/app/api/drivers/applications/route'
import { listApplications } from '@/services/driverApplicationService'

const DRAFT_ID = '11111111-2222-4333-8444-555555555555'

function buildPayload() {
  // Documents are optional now, but the happy-path test still uploads all of them
  // to exercise the draft → reference-number move logic.
  const documents: Record<string, string[]> = {}
  for (const key of DOCUMENT_TYPE_KEYS) {
    documents[key] = [`drivers/_drafts/${DRAFT_ID}/${key}/file.pdf`]
  }
  return {
    full_name: 'Asha Rao',
    phone: '9876543210',
    email: 'asha@example.com',
    date_of_birth: '1990-01-01',
    address: '12 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    aadhaar_number: '123412341234',
    emergency_contact_name: 'Ravi',
    emergency_contact_phone: '9876500000',
    vehicle_registration: 'KA01AB1234',
    vehicle_type: 'ambulance',
    ambulance_permit_number: 'PERMIT-1',
    license_number: 'DL-1234',
    license_expiry: '2035-01-01',
    license_type: 'LMV',
    draftId: DRAFT_ID,
    documents,
  }
}

function makeRequest(payload: unknown) {
  return new NextRequest('http://localhost/api/drivers/applications', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(payload),
  })
}

describe('POST /api/drivers/applications (submit → email → admin-visible)', () => {
  beforeEach(() => {
    h.inserted.length = 0
    h.emailSpy.mockClear()
  })

  it('mints a reference, stores a pending row, and sends emails', async () => {
    const res = await POST(makeRequest(buildPayload()))
    expect(res.status).toBe(201)

    const json = (await res.json()) as { reference_number: string; id: string }
    expect(json.reference_number).toMatch(REFERENCE_NUMBER_RE)

    // Row persisted with status pending + encrypted PII + final document paths.
    expect(h.inserted).toHaveLength(1)
    const row = h.inserted[0] as Record<string, unknown>
    expect(row.status).toBe('pending')
    expect(row.aadhaar_ciphertext).toBe('cipher')
    expect(row.aadhaar_last4).toBe('1234')
    const docs = row.documents as Record<string, string[]>
    expect(docs.registration_certificate[0]).toContain(`drivers/${json.reference_number}/`)

    // Two transactional emails dispatched via the wrapper (called once).
    expect(h.emailSpy).toHaveBeenCalledTimes(1)

    // Admin list now returns the stored application.
    const visible = await listApplications()
    expect(visible.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects an incomplete application with 400', async () => {
    const bad = { ...buildPayload(), email: 'nope' }
    const res = await POST(makeRequest(bad))
    expect(res.status).toBe(400)
    expect(h.inserted).toHaveLength(0)
  })
})
