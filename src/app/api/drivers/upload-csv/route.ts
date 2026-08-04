import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseAuthUser } from '@/lib/clerk-user-creation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { UserService } from '@/services/userService'
import { parseCsv, missingHeaders } from '@/lib/csv/parseCsv'
import { lookupTransportCompanyId, resolveLocationIds } from '@/lib/csv/lookups'
import { rollbackProvisionedUser } from '@/lib/provisionRollback'
import { EMAIL_REGEX, PHONE_REGEX } from '@/lib/validation/driverApplication'

// Service-role client (bypasses RLS) for privileged CSV provisioning.
const supabase = createClient()

interface CSVDriver {
  full_name: string
  email: string
  phone?: string
  license_number: string
  aadhar_number?: string
  status?: string
  is_verified?: string
  transport_company_name?: string
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
//
// transport_company_name is here because drivers.transport_company_id is NOT NULL
// in the database. A blank company used to pass every check, create the login, and
// only then fail the INSERT — leaving an orphan account behind and a row that could
// never be imported without deleting it by hand first.
const REQUIRED_HEADERS = ['full_name', 'email', 'license_number', 'transport_company_name']

export async function POST(request: NextRequest) {
  try {
    // Admin only.
    const gate = await requireAdmin()
    if (gate.error) return gate.error

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
      // Malformed rows never reach the import loop, so seed the failure count with
      // them — otherwise a file where half the rows had a stray comma reports
      // "0 failed" while quietly importing only the other half.
      failed: parsed.errors.length,
      errors: [...parsed.errors],
      usersCreated: 0,
      createdUsers: [] as any[]
    }

    // Emails seen earlier IN THIS FILE. The existing-user check below reads the
    // database, which does not yet know about a row created moments ago in the
    // same upload — so a file listing the same driver twice used to create the
    // first and fail the second with a confusing "already exists".
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

        // Drivers are India-only, enforced on the application form and the driver
        // profile screen. Import bypassed it entirely, which is how a driver who
        // can never be dispatched gets into the fleet.
        const phone = record.phone?.trim()
        if (phone && !PHONE_REGEX.test(phone)) {
          results.errors.push(
            `Row ${line}: "${phone}" is not a valid 10-digit Indian mobile number ` +
              '(no country code, no leading zero).'
          )
          results.failed++
          continue
        }

        // An unrecognised status used to be silently rewritten to 'available'.
        // For a fleet-dispatch flag that is worth saying out loud, so a typo like
        // "Available " or "active" is corrected in the spreadsheet rather than
        // discovered later as a driver who is on shift when they should not be.
        // Checked here, before any account is created, so a typo does not leave an
        // orphan login behind.
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

        // Check if email already exists in database
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

        // Resolve every name reference BEFORE creating the login. Doing it after
        // meant a bad company name left behind an orphan auth user that the
        // operator then had to clean up by hand.
        //
        // The company is mandatory: drivers.transport_company_id is NOT NULL, so a
        // blank cell is a row that cannot be stored, not a driver without a company.
        const companyName = record.transport_company_name?.trim()
        if (!companyName) {
          results.errors.push(
            `Row ${line}: transport_company_name is required — every driver must belong to a ` +
              'transport company. Import the company first, then use its exact name here.'
          )
          results.failed++
          continue
        }

        let transportCompanyId: string | null = null
        const company = await lookupTransportCompanyId(supabase, companyName)
        if (company.status === 'found') {
          transportCompanyId = company.id
        } else {
          results.errors.push(
            company.status === 'ambiguous'
              ? `Row ${line}: transport company "${companyName}" matches ${company.count} records — it is ambiguous.`
              : company.status === 'error'
                ? `Row ${line}: transport company "${companyName}" could not be looked up: ${company.message}`
                : `Row ${line}: transport company "${companyName}" was not found. Import transport companies first.`
          )
          results.failed++
          continue
        }

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

        // Create the login (Supabase auth user). The handle_new_auth_user() DB
        // trigger auto-creates the public.users row and links it — so we must NOT
        // insert a users row (with a clerk_user_id) ourselves.
        const userCreationResult = await createSupabaseAuthUser(
          record.email.trim(),
          record.full_name.trim(),
          'driver',
          record.phone
        )

        if (!userCreationResult.success || !userCreationResult.appUserId) {
          results.errors.push(`Row ${line}: failed to create user ${email}: ${userCreationResult.error || 'user row not provisioned'}`)
          results.failed++
          continue
        }

        const appUserId = userCreationResult.appUserId

        // Persist CSV-provided profile fields that the auth identity does not carry.
        await UserService.updateUser(appUserId, {
          full_name: record.full_name.trim(),
          phone: record.phone || undefined,
        })

        // Upsert the driver profile keyed on the provisioned users.id.
        const { error: driverError } = await supabase
          .from('drivers')
          .upsert({
            user_id: appUserId,
            license_number: record.license_number.trim(),
            aadhar_number: record.aadhar_number || null,
            is_verified: record.is_verified?.toLowerCase() === 'true',
            status,
            transport_company_id: transportCompanyId,
            latitude: record.latitude ? parseFloat(record.latitude) : null,
            longitude: record.longitude ? parseFloat(record.longitude) : null,
            address_line: record.address_line || null,
            ...locationIds
          }, { onConflict: 'user_id' })

        if (driverError) {
          // Undo the login this row just created. Without this the operator fixes
          // the offending cell, re-uploads, and every corrected row is rejected as
          // "email already exists" by the check further up — the orphan account
          // blocks the very retry it should be inviting.
          const { warning } = await rollbackProvisionedUser({
            authUserId: userCreationResult.authUserId,
            appUserId,
          })
          seenEmails.delete(email)
          results.errors.push(
            `Row ${line}: failed to create driver record for ${email}: ${driverError.message}` +
              (warning ? ` ${warning}` : ' The part-created login was removed, so you can fix this row and upload it again.')
          )
          results.failed++
        } else {
          results.success++
          results.usersCreated++
          results.createdUsers.push({
            email: record.email,
            full_name: record.full_name,
            role: 'driver'
          })
        }
      } catch (err) {
        results.errors.push(`Row ${line}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.failed++
      }
    }

    return NextResponse.json({
      message:
        results.failed > 0
          ? `Created ${results.usersCreated} drivers. ${results.failed} row(s) were rejected and imported nothing — see the errors below. Imported users can log in by resetting their password.`
          : `Created ${results.usersCreated} drivers successfully. Users can log in by resetting their password.`,
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
