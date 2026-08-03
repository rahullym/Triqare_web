import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createSupabaseAuthUser } from '@/lib/clerk-user-creation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { parseCsv, missingHeaders } from '@/lib/csv/parseCsv'
import { resolveLocationIds } from '@/lib/csv/lookups'
import { EMAIL_REGEX, PHONE_REGEX } from '@/lib/validation/driverApplication'

interface CSVTransportCompany {
  company_name: string
  email: string
  full_name: string  // Contact person name
  phone?: string
  registration_number?: string
  license_valid_till?: string
  is_verified?: string
  address_line?: string
  country_name?: string
  state_name?: string
  city_name?: string
  pincode?: string
}

// Parse date from various formats to PostgreSQL format (YYYY-MM-DD)
function parseDate(dateStr?: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null

  const cleaned = dateStr.trim()

  // Try DD-MM-YYYY format (e.g., 15-01-1990)
  const ddmmyyyyMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try DD/MM/YYYY format (e.g., 15/01/1990)
  const ddmmyyyySlashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyySlashMatch) {
    const [, day, month, year] = ddmmyyyySlashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try YYYY-MM-DD format (already correct)
  const yyyymmddMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (yyyymmddMatch) {
    const [, year, month, day] = yyyymmddMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try ISO format (e.g., 2024-01-15T00:00:00.000Z)
  try {
    const date = new Date(cleaned)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch (e) {
    // Invalid date
  }

  console.warn(`Could not parse date: ${dateStr}`)
  return null
}

// Columns the importer cannot work without. Checked against the header row once,
// up front, so a stale template fails with one clear message instead of one
// "missing required fields" per data row.
const REQUIRED_HEADERS = ['company_name', 'email', 'full_name']

export async function POST(request: NextRequest) {
  try {
    // Admin-only: bulk-creating transport_company logins is a privileged write.
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
      // Seeded with the malformed rows, which never reach the loop below — a file
      // where half the rows had a stray comma otherwise reports "0 failed".
      failed: parsed.errors.length,
      errors: [...parsed.errors],
      usersCreated: 0,
      createdUsers: [] as any[]
    }

    // The existing-user check reads the database, which does not yet know about a
    // row created moments ago in this same upload.
    const seenEmails = new Set<string>()

    for (const { line, values } of parsed.rows) {
      const record = values as unknown as CSVTransportCompany
      try {
        // Validate required fields
        if (!record.company_name || !record.email || !record.full_name) {
          results.errors.push(
            `Row ${line}: company_name, email and full_name are all required.`
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

        const phone = record.phone?.trim()
        if (phone && !PHONE_REGEX.test(phone)) {
          results.errors.push(
            `Row ${line}: "${phone}" is not a valid 10-digit Indian mobile number ` +
              '(no country code, no leading zero).'
          )
          results.failed++
          continue
        }

        // A licence date that could not be parsed used to be written as NULL with
        // only a server-side console.warn — the operator saw a successful import
        // and a company with no licence expiry.
        const rawLicenceDate = record.license_valid_till?.trim()
        const licenceValidTill = parseDate(rawLicenceDate)
        if (rawLicenceDate && !licenceValidTill) {
          results.errors.push(
            `Row ${line}: license_valid_till "${rawLicenceDate}" is not a recognised date. ` +
              'Use DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD.'
          )
          results.failed++
          continue
        }

        if (seenEmails.has(email)) {
          results.errors.push(`Row ${line}: ${email} appears more than once in this file.`)
          results.failed++
          continue
        }

        // Check if email already exists in database. maybeSingle, not single —
        // single() treats "no rows" as an error, so the previous code was relying
        // on an error path to mean "available".
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

        // Resolve locations BEFORE creating the login, so a bad cell does not
        // leave an orphan auth user behind for someone to clean up by hand.
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

        // Create the Supabase auth login. The handle_new_auth_user() trigger
        // provisions the public.users row (role via app_metadata); do NOT insert a
        // users row here or it double-inserts against the unique email.
        const userCreationResult = await createSupabaseAuthUser(
          record.email.trim(),
          record.full_name.trim(),
          'transport_company',
          record.phone
        )

        if (!userCreationResult.success || !userCreationResult.appUserId) {
          results.errors.push(`Row ${line}: failed to create user ${email}: ${userCreationResult.error}`)
          results.failed++
          continue
        }
        const appUserId = userCreationResult.appUserId

        // Fill in profile fields on the trigger-created users row.
        await supabase
          .from('users')
          .update({ full_name: record.full_name.trim(), phone: record.phone || null })
          .eq('id', appUserId)

        // Create transport company record
        const { error: companyError } = await supabase
          .from('transport_companies')
          .insert({
            user_id: appUserId,
            company_name: record.company_name.trim(),
            address_line: record.address_line || null,
            registration_number: record.registration_number || null,
            license_valid_till: licenceValidTill,
            is_verified: record.is_verified?.toLowerCase() === 'true',
            ...locationIds
          })

        if (companyError) {
          results.errors.push(`Row ${line}: failed to create transport company record for ${email}: ${companyError.message}`)
          results.failed++
        } else {
          results.success++
          results.usersCreated++
          results.createdUsers.push({
            email: record.email,
            full_name: record.full_name,
            company_name: record.company_name,
            role: 'transport_company'
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
          ? `Created ${results.usersCreated} transport companies. ${results.failed} row(s) were rejected and imported nothing — see the errors below. Imported users can log in by resetting their password.`
          : `Created ${results.usersCreated} transport companies successfully. Users can log in by resetting their password.`,
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

