import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseAuthUser } from '@/lib/clerk-user-creation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { UserService } from '@/services/userService'

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

// Parse CSV string to array of objects
function parseCSV(csvText: string): CSVDriver[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const records: CSVDriver[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || ''
    })
    records.push(record as unknown as CSVDriver)
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
async function lookupLocationIds(record: CSVDriver) {
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

// Lookup transport company by name
async function lookupTransportCompany(companyName: string) {
  if (!companyName) return null

  const { data: company } = await supabase
    .from('transport_companies')
    .select('user_id')
    .ilike('company_name', companyName.trim())
    .single()

  return company?.user_id || null
}

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
        if (!record.full_name || !record.email || !record.license_number) {
          results.errors.push(`Row missing required fields: ${record.full_name || record.email || 'Unknown'}`)
          results.failed++
          continue
        }

        // Check if email already exists in database
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', record.email.trim())
          .maybeSingle()

        if (existingUser) {
          results.errors.push(`Email already exists: ${record.email}`)
          results.failed++
          continue
        }

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
          results.errors.push(`Failed to create user ${record.email}: ${userCreationResult.error || 'user row not provisioned'}`)
          results.failed++
          continue
        }

        const appUserId = userCreationResult.appUserId

        // Persist CSV-provided profile fields that the auth identity does not carry.
        await UserService.updateUser(appUserId, {
          full_name: record.full_name.trim(),
          phone: record.phone || undefined,
        })

        // Get location IDs and transport company
        const locationIds = await lookupLocationIds(record)
        const transportCompanyId = await lookupTransportCompany(record.transport_company_name || '')

        const validStatuses = ['available', 'assigned', 'on_trip', 'inactive']
        const status = record.status && validStatuses.includes(record.status.toLowerCase())
          ? record.status.toLowerCase()
          : 'available'

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
          results.errors.push(`Failed to create driver record for ${record.email}: ${driverError.message}`)
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
        results.errors.push(`Error processing ${record.full_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.failed++
      }
    }

    return NextResponse.json({
      message: `Created ${results.usersCreated} drivers successfully. ${results.failed} failed. Users can login by resetting their password.`,
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
