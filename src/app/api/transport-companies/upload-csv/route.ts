import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createSupabaseAuthUser } from '@/lib/clerk-user-creation'
import { requireAdmin } from '@/lib/auth/requireAdmin'

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

// Parse CSV string to array of objects
function parseCSV(csvText: string): CSVTransportCompany[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const records: CSVTransportCompany[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || ''
    })
    records.push(record as unknown as CSVTransportCompany)
  }

  return records
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// Lookup location IDs by name
async function lookupLocationIds(record: CSVTransportCompany) {
  let country_id = null, state_id = null, city_id = null, pincode_id = null

  if (record.country_name) {
    const { data: country } = await supabase
      .from('countries')
      .select('id')
      .ilike('name', record.country_name.trim())
      .single()
    country_id = country?.id || null
  }

  if (country_id && record.state_name) {
    const { data: state } = await supabase
      .from('states')
      .select('id')
      .eq('country_id', country_id)
      .ilike('name', record.state_name.trim())
      .single()
    state_id = state?.id || null
  }

  if (state_id && record.city_name) {
    const { data: city } = await supabase
      .from('cities')
      .select('id')
      .eq('state_id', state_id)
      .ilike('name', record.city_name.trim())
      .single()
    city_id = city?.id || null
  }

  if (city_id && record.pincode) {
    const { data: pincode } = await supabase
      .from('pincodes')
      .select('id')
      .eq('city_id', city_id)
      .ilike('code', record.pincode.trim())
      .single()
    pincode_id = pincode?.id || null
  }

  return { country_id, state_id, city_id, pincode_id }
}

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
    const records = parseCSV(csvText)

    if (records.length === 0) {
      return NextResponse.json({ error: 'No valid records found in CSV' }, { status: 400 })
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      usersCreated: 0,
      createdUsers: [] as any[]
    }

    for (const record of records) {
      try {
        // Validate required fields
        if (!record.company_name || !record.email || !record.full_name) {
          results.errors.push(`Row missing required fields: ${record.company_name || record.email || 'Unknown'}`)
          results.failed++
          continue
        }

        // Check if email already exists in database
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', record.email.trim())
          .single()

        if (existingUser) {
          results.errors.push(`Email already exists: ${record.email}`)
          results.failed++
          continue
        }

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
          results.errors.push(`Failed to create user ${record.email}: ${userCreationResult.error}`)
          results.failed++
          continue
        }
        const appUserId = userCreationResult.appUserId

        // Fill in profile fields on the trigger-created users row.
        await supabase
          .from('users')
          .update({ full_name: record.full_name.trim(), phone: record.phone || null })
          .eq('id', appUserId)

        // Get location IDs
        const locationIds = await lookupLocationIds(record)

        // Create transport company record
        const { error: companyError } = await supabase
          .from('transport_companies')
          .insert({
            user_id: appUserId,
            company_name: record.company_name.trim(),
            address_line: record.address_line || null,
            registration_number: record.registration_number || null,
            license_valid_till: parseDate(record.license_valid_till),
            is_verified: record.is_verified?.toLowerCase() === 'true',
            ...locationIds
          })

        if (companyError) {
          results.errors.push(`Failed to create transport company record for ${record.email}: ${companyError.message}`)
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
        results.errors.push(`Error processing ${record.company_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.failed++
      }
    }

    return NextResponse.json({
      message: `Created ${results.usersCreated} transport companies successfully. ${results.failed} failed. Users can login by resetting their password.`,
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

