import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { encryptField, last4 } from '@/lib/crypto/fieldEncryption'
import { driverApplicationSubmitSchema } from '@/lib/validation/driverApplication'
import {
  DRIVER_DOCS_BUCKET,
  REQUIRED_DOCUMENT_KEYS,
  finalObjectPath,
} from '@/lib/storage/driverDocuments'
import {
  generateReferenceNumber,
  insertApplication,
  type InsertApplicationInput,
} from '@/services/driverApplicationService'
import { sendSubmissionEmails } from '@/lib/email/sendApplicationEmails'
import { isValidReferenceNumber } from '@/lib/referenceNumber'

type Supabase = ReturnType<typeof createServerClient>

/** Returns true if an object exists at `path` (used for retry tolerance). */
async function objectExists(supabase: Supabase, path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(DRIVER_DOCS_BUCKET).createSignedUrl(path, 60)
  return !error && !!data?.signedUrl
}

/** Move a draft object to its final path; tolerant of an already-moved source (retry). */
async function moveTolerant(supabase: Supabase, from: string, to: string): Promise<void> {
  const { error } = await supabase.storage.from(DRIVER_DOCS_BUCKET).move(from, to)
  if (!error) return
  if (await objectExists(supabase, to)) return // already moved on a prior attempt
  throw new Error(`Failed to move document into place`)
}

// POST /api/drivers/applications  (PUBLIC submit)
export async function POST(request: NextRequest) {
  try {
    // 1. Rate limit (5 / IP / hour)
    const ip = getClientIp(request.headers)
    if (!(await checkRateLimit(ip, 'submit', 5, '1 hour'))) {
      return NextResponse.json(
        { error: 'Too many submissions from this network. Please try again later.' },
        { status: 429 },
      )
    }

    // 2. Server-side re-validation (never trust the client)
    const parsed = driverApplicationSubmitSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please fill all mandatory fields', issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const input = parsed.data

    // 3. All mandatory documents present?
    const missing = REQUIRED_DOCUMENT_KEYS.filter(
      (k) => !input.documents[k] || input.documents[k].length === 0,
    )
    if (missing.length) {
      return NextResponse.json({ error: 'Please upload all required documents' }, { status: 400 })
    }

    // 4. Mint reference number (atomic per-day sequence)
    const referenceNumber = await generateReferenceNumber()
    if (!isValidReferenceNumber(referenceNumber)) {
      throw new Error('Generated reference number has an unexpected format')
    }
    const supabase = createServerClient()

    // 5. Move uploaded draft files into the reference-numbered prefix
    const finalDocuments: Record<string, string[]> = {}
    for (const [docType, draftPaths] of Object.entries(input.documents)) {
      finalDocuments[docType] = []
      for (const draftPath of draftPaths) {
        const dest = finalObjectPath(referenceNumber, draftPath)
        await moveTolerant(supabase, draftPath, dest)
        finalDocuments[docType].push(dest)
      }
    }

    // 6. Encrypt PII (never logged)
    const aadhaar = encryptField(input.aadhaar_number)
    const license = encryptField(input.license_number)

    // 7. Persist (status defaults to 'pending')
    const row: InsertApplicationInput = {
      reference_number: referenceNumber,
      full_name: input.full_name,
      phone: input.phone,
      email: input.email,
      date_of_birth: input.date_of_birth,
      address: input.address,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      emergency_contact_name: input.emergency_contact_name,
      emergency_contact_phone: input.emergency_contact_phone,
      aadhaar_ciphertext: aadhaar.ciphertext,
      aadhaar_iv: aadhaar.iv,
      aadhaar_tag: aadhaar.tag,
      aadhaar_last4: last4(input.aadhaar_number),
      vehicle_registration: input.vehicle_registration,
      vehicle_type: input.vehicle_type,
      vehicle_make_model: input.vehicle_make_model ?? null,
      vehicle_year: input.vehicle_year ?? null,
      ambulance_permit_number: input.ambulance_permit_number ?? null,
      license_ciphertext: license.ciphertext,
      license_iv: license.iv,
      license_tag: license.tag,
      license_last4: last4(input.license_number),
      license_expiry: input.license_expiry,
      license_type: input.license_type ?? null,
      driving_experience_years: input.driving_experience_years ?? null,
      previous_ambulance_experience: input.previous_ambulance_experience ?? null,
      document_storage_path: `drivers/${referenceNumber}`,
      documents: finalDocuments,
    }

    const { id } = await insertApplication(row)

    // 8. Transactional emails (best-effort; never block success)
    const submittedAt = new Date().toISOString()
    await sendSubmissionEmails({
      applicationId: id,
      referenceNumber,
      fullName: input.full_name,
      email: input.email,
      phone: input.phone,
      submittedAt,
      summary: {
        vehicleType: input.vehicle_type,
        licenseType: input.license_type,
        experienceYears: input.driving_experience_years ?? null,
      },
    })

    return NextResponse.json({ reference_number: referenceNumber, id }, { status: 201 })
  } catch (err) {
    // Never log PII; surface a generic message so the client shows the retry screen.
    console.error('[applications:submit] error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 })
  }
}
