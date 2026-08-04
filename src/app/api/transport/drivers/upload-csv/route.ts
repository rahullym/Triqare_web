import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { createSupabaseAuthUser } from '@/lib/clerk-user-creation'
import { parseCsv, missingHeaders } from '@/lib/csv/parseCsv'
import { resolveLocationIds } from '@/lib/csv/lookups'
import { rollbackProvisionedUser } from '@/lib/provisionRollback'
import { EMAIL_REGEX, PHONE_REGEX } from '@/lib/validation/driverApplication'

// Service-role client: provisioning logins is a privileged write, and the anon
// client this route used before only worked while RLS stayed permissive.
const supabase = createClient()

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
      usersCreated: 0,
      createdDrivers: [] as any[]
    }

    // The database check below cannot see a login created moments ago in this same
    // upload, so a duplicated row would otherwise fail confusingly on the second.
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

        // Resolve locations BEFORE creating the login, so a bad cell does not leave
        // an orphan account behind for someone to clean up by hand.
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

        // Provision the driver outright.
        //
        // WHAT THIS REPLACES. This route used to email an invitation and stash the
        // driver's details in `pending_csv_imports`, to be materialised when the
        // invitation was accepted. Nothing ever read that table — no signup hook, no
        // job, nothing — so the drivers were never created, while the upload
        // reported "Sent N invitations successfully". It now creates the account and
        // the driver record the same way the admin importer does; the driver signs in
        // via "Forgot password", exactly like an admin-imported one.
        const userCreationResult = await createSupabaseAuthUser(
          record.email.trim(),
          record.full_name.trim(),
          'driver',
          record.phone
        )

        if (!userCreationResult.success || !userCreationResult.appUserId) {
          results.errors.push(`Row ${line}: failed to create user ${email}: ${userCreationResult.error}`)
          results.failed++
          continue
        }
        const appUserId = userCreationResult.appUserId

        await supabase
          .from('users')
          .update({ full_name: record.full_name.trim(), phone: record.phone || null })
          .eq('id', appUserId)

        const { error: driverError } = await supabase
          .from('drivers')
          .upsert({
            user_id: appUserId,
            license_number: record.license_number.trim(),
            aadhar_number: record.aadhar_number || null,
            is_verified: false, // Always false for new drivers
            status,
            transport_company_id: transportCompany.user_id, // the logged-in company
            latitude: record.latitude ? parseFloat(record.latitude) : null,
            longitude: record.longitude ? parseFloat(record.longitude) : null,
            address_line: record.address_line || null,
            last_updated_at: new Date().toISOString(),
            ...locationIds
          }, { onConflict: 'user_id' })

        if (driverError) {
          // Undo the login this row just created — an orphan account would be
          // rejected as "email already exists" when the company re-uploads the
          // corrected row. See rollbackProvisionedUser.
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
          results.createdDrivers.push({
            email: record.email,
            full_name: record.full_name,
            license_number: record.license_number,
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
          ? `Added ${results.usersCreated} drivers to ${transportCompany.company_name}. ${results.failed} row(s) were rejected and imported nothing — see the errors below. Imported drivers sign in by resetting their password.`
          : `Added ${results.usersCreated} drivers to ${transportCompany.company_name} successfully. They sign in by resetting their password.`,
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


