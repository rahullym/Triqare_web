import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendUserInvitation } from '@/lib/invitations'
import { getAuthedUser } from '@/lib/supabase/server'
import { parseCsv, missingHeaders } from '@/lib/csv/parseCsv'
import { resolveLocationIds } from '@/lib/csv/lookups'
import { EMAIL_REGEX, PHONE_REGEX } from '@/lib/validation/driverApplication'

interface CSVDriver {
  full_name: string
  email: string
  phone?: string
  license_number: string
  aadhar_number?: string
  status?: string
  latitude?: string
  longitude?: string
  address_line?: string
  country_name?: string
  state_name?: string
  city_name?: string
  pincode?: string
}

// Columns the importer cannot work without. Checked against the header row once,
// up front, so a stale template fails with one clear message instead of one
// "missing required fields" per data row.
const REQUIRED_HEADERS = ['full_name', 'email', 'license_number']

export async function POST(request: NextRequest) {
  try {
    // Get current user (must be transport company)
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // appUser IS the caller's public.users row
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (appUser.role !== 'transport_company') {
      return NextResponse.json({ error: 'Only transport companies can upload drivers' }, { status: 403 })
    }

    const currentUser: any = appUser

    // Verify transport company exists
    const { data: transportCompany, error: companyError } = await supabase
      .from('transport_companies')
      .select('user_id, company_name')
      .eq('user_id', currentUser.id)
      .single()

    if (companyError || !transportCompany) {
      return NextResponse.json({ error: 'Transport company not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const csvText = await file.text()
    const parsed = parseCsv(csvText)

    const absent = missingHeaders(parsed.headers, REQUIRED_HEADERS)
    if (absent.length > 0) {
      return NextResponse.json(
        {
          error:
            `The file is missing required column(s): ${absent.join(', ')}. ` +
            'Download the template to get the expected columns.',
        },
        { status: 400 }
      )
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: parsed.errors[0] ?? 'No valid records found in CSV', errors: parsed.errors },
        { status: 400 }
      )
    }

    const results = {
      success: 0,
      // Seeded with the malformed rows, which never reach the loop below.
      failed: parsed.errors.length,
      errors: [...parsed.errors],
      invitationsSent: 0,
      pendingData: [] as any[]
    }

    // The database check below cannot see an invitation sent moments ago in this
    // same upload, so a duplicated row would send two invitations to one address.
    const seenEmails = new Set<string>()

    for (const { line, values } of parsed.rows) {
      const record = values as unknown as CSVDriver
      try {
        // Validate required fields
        if (!record.full_name || !record.email || !record.license_number) {
          results.errors.push(
            `Row ${line}: full_name, email and license_number are all required.`
          )
          results.failed++
          continue
        }

        const email = record.email.trim().toLowerCase()
        if (!EMAIL_REGEX.test(email)) {
          results.errors.push(`Row ${line}: "${record.email}" is not a valid email address.`)
          results.failed++
          continue
        }

        // Drivers are India-only everywhere else in the product; import used to be
        // the one door that let a non-dispatchable number through.
        const phone = record.phone?.trim()
        if (phone && !PHONE_REGEX.test(phone)) {
          results.errors.push(
            `Row ${line}: "${phone}" is not a valid 10-digit Indian mobile number ` +
              '(no country code, no leading zero).'
          )
          results.failed++
          continue
        }

        const validStatuses = ['available', 'assigned', 'on_trip', 'inactive']
        const rawStatus = record.status?.trim().toLowerCase()
        if (rawStatus && !validStatuses.includes(rawStatus)) {
          results.errors.push(
            `Row ${line}: status "${record.status}" is not one of ${validStatuses.join(', ')}.`
          )
          results.failed++
          continue
        }
        const status = rawStatus || 'available'

        if (seenEmails.has(email)) {
          results.errors.push(`Row ${line}: ${email} appears more than once in this file.`)
          results.failed++
          continue
        }

        // maybeSingle, not single — single() reports "no rows" as an error, so the
        // previous code depended on an error path meaning "address is available".
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (existingUser) {
          results.errors.push(`Row ${line}: email already exists: ${email}`)
          results.failed++
          continue
        }

        // Resolve locations BEFORE sending the invitation. Doing it after meant a
        // bad location cell still emailed the driver, and the invite could not be
        // unsent.
        const { ids: locationIds, errors: locationErrors } = await resolveLocationIds(
          supabase,
          record
        )
        if (locationErrors.length > 0) {
          results.errors.push(`Row ${line}: ${locationErrors.join(' ')}`)
          results.failed++
          continue
        }

        seenEmails.add(email)

        // Send Clerk invitation
        const invitationResult = await sendUserInvitation(
          record.email.trim(),
          'driver',
          currentUser.id
        )

        if (!invitationResult.success) {
          results.errors.push(`Row ${line}: failed to send invitation to ${email}: ${invitationResult.error}`)
          results.failed++
          continue
        }

        const pendingDriverData = {
          invitationId: invitationResult.invitationId,
          email: record.email.trim(),
          full_name: record.full_name.trim(),
          phone: record.phone || null,
          license_number: record.license_number.trim(),
          aadhar_number: record.aadhar_number || null,
          is_verified: false, // Always false for new drivers
          status,
          transport_company_id: transportCompany.user_id, // Automatically set to logged-in transport company
          latitude: record.latitude ? parseFloat(record.latitude) : null,
          longitude: record.longitude ? parseFloat(record.longitude) : null,
          address_line: record.address_line || null,
          ...locationIds
        }

        // Store in pending_csv_imports table
        const { error: pendingError } = await supabase
          .from('pending_csv_imports')
          .insert({
            invitation_id: invitationResult.invitationId,
            email: record.email.trim(),
            role: 'driver',
            import_type: 'driver',
            data: pendingDriverData,
            imported_by: currentUser.id
          })

        if (pendingError) {
          results.errors.push(`Row ${line}: failed to store pending data for ${email}: ${pendingError.message}`)
          results.failed++
        } else {
          results.success++
          results.invitationsSent++
          results.pendingData.push(pendingDriverData)
        }
      } catch (err) {
        results.errors.push(`Row ${line}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.failed++
      }
    }

    return NextResponse.json({
      message:
        results.failed > 0
          ? `Sent ${results.invitationsSent} invitations. ${results.failed} row(s) were rejected and sent nothing — see the errors below. Drivers will be added to ${transportCompany.company_name} when they accept.`
          : `Sent ${results.invitationsSent} invitations successfully. Drivers will be added to ${transportCompany.company_name} when they accept invitations.`,
      ...results
    })
  } catch (error) {
    console.error('CSV upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process CSV' },
      { status: 500 }
    )
  }
}


