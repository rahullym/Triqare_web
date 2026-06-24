import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createServerClient } from '@/lib/supabase/server'
import { decryptField } from '@/lib/crypto/fieldEncryption'
import { DRIVER_DOCS_BUCKET } from '@/lib/storage/driverDocuments'
import {
  getApplicationById,
  findPriorApplications,
  updateReview,
} from '@/services/driverApplicationService'
import { sendApprovalEmail, sendRejectionEmail } from '@/lib/email/sendApplicationEmails'

const SIGNED_URL_TTL = 300 // 5 minutes
const MAX_REASON_LEN = 1000

function tryDecrypt(ciphertext: string, iv: string, tag: string): string | null {
  try {
    return decryptField({ ciphertext, iv, tag })
  } catch {
    return null // e.g. ENCRYPTION_KEY missing/rotated — fall back to masked last4
  }
}

// GET /api/admin/driver-applications/[id]  (ADMIN) — full detail + signed doc URLs
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard.error) return guard.error

  try {
    const { id } = await params
    const app = await getApplicationById(id)
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const supabase = createServerClient()
    const documents: Record<string, { name: string; url: string | null }[]> = {}
    for (const [docType, paths] of Object.entries(app.documents ?? {})) {
      documents[docType] = []
      for (const path of paths) {
        const { data } = await supabase.storage
          .from(DRIVER_DOCS_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL)
        documents[docType].push({
          name: path.split('/').pop() ?? path,
          url: data?.signedUrl ?? null,
        })
      }
    }

    const priors = await findPriorApplications(app.email, app.phone, app.id)

    return NextResponse.json({
      success: true,
      application: {
        id: app.id,
        reference_number: app.reference_number,
        full_name: app.full_name,
        phone: app.phone,
        email: app.email,
        date_of_birth: app.date_of_birth,
        address: app.address,
        city: app.city,
        state: app.state,
        pincode: app.pincode,
        emergency_contact_name: app.emergency_contact_name,
        emergency_contact_phone: app.emergency_contact_phone,
        aadhaar_number: tryDecrypt(app.aadhaar_ciphertext, app.aadhaar_iv, app.aadhaar_tag),
        aadhaar_last4: app.aadhaar_last4,
        vehicle_registration: app.vehicle_registration,
        vehicle_type: app.vehicle_type,
        vehicle_make_model: app.vehicle_make_model,
        vehicle_year: app.vehicle_year,
        ambulance_permit_number: app.ambulance_permit_number,
        license_number: tryDecrypt(app.license_ciphertext, app.license_iv, app.license_tag),
        license_last4: app.license_last4,
        license_expiry: app.license_expiry,
        license_type: app.license_type,
        driving_experience_years: app.driving_experience_years,
        previous_ambulance_experience: app.previous_ambulance_experience,
        status: app.status,
        rejection_reason: app.rejection_reason,
        reviewed_by: app.reviewed_by,
        reviewed_at: app.reviewed_at,
        created_at: app.created_at,
        documents,
      },
      priors: priors.map((p) => ({
        reference_number: p.reference_number,
        created_at: p.created_at,
        status: p.status,
        rejection_reason: p.rejection_reason,
        reviewed_at: p.reviewed_at,
      })),
    })
  } catch (err) {
    console.error('[admin:applications:get] error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'Failed to load application' }, { status: 500 })
  }
}

// PATCH /api/admin/driver-applications/[id]  (ADMIN) — approve / reject
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard.error) return guard.error

  try {
    const { id } = await params
    const body = (await request.json()) as { action?: string; reason?: string }

    const app = await getApplicationById(id)
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    if (body.action === 'approve') {
      const updated = await updateReview(id, {
        status: 'approved',
        rejection_reason: null,
        reviewed_by: guard.userId,
      })
      await sendApprovalEmail({
        referenceNumber: updated.reference_number,
        fullName: updated.full_name,
        email: updated.email,
      })
      return NextResponse.json({ success: true, status: updated.status })
    }

    if (body.action === 'reject') {
      const reason = (body.reason ?? '').trim()
      if (!reason) {
        return NextResponse.json({ error: 'Please enter rejection reason' }, { status: 400 })
      }
      if (reason.length > MAX_REASON_LEN) {
        return NextResponse.json(
          { error: `Rejection reason must be at most ${MAX_REASON_LEN} characters` },
          { status: 400 },
        )
      }
      const updated = await updateReview(id, {
        status: 'rejected',
        rejection_reason: reason,
        reviewed_by: guard.userId,
      })
      await sendRejectionEmail({
        referenceNumber: updated.reference_number,
        fullName: updated.full_name,
        email: updated.email,
        reason,
      })
      return NextResponse.json({ success: true, status: updated.status })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[admin:applications:patch] error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
  }
}
