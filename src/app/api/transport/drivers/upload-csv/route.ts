import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendUserInvitation } from '@/lib/invitations'
import { getAuthedUser } from '@/lib/supabase/server'

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
    const records = parseCSV(csvText)

    if (records.length === 0) {
      return NextResponse.json({ error: 'No valid records found in CSV' }, { status: 400 })
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      invitationsSent: 0,
      pendingData: [] as any[]
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
          .single()

        if (existingUser) {
          results.errors.push(`Email already exists: ${record.email}`)
          results.failed++
          continue
        }

        // Send Clerk invitation
        const invitationResult = await sendUserInvitation(
          record.email.trim(),
          'driver',
          currentUser.id
        )

        if (!invitationResult.success) {
          results.errors.push(`Failed to send invitation to ${record.email}: ${invitationResult.error}`)
          results.failed++
          continue
        }

        // Store pending driver data for when user accepts invitation
        const locationIds = await lookupLocationIds(record)

        const validStatuses = ['available', 'assigned', 'on_trip', 'inactive']
        const status = record.status && validStatuses.includes(record.status.toLowerCase())
          ? record.status.toLowerCase()
          : 'available'

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
          results.errors.push(`Failed to store pending data for ${record.email}: ${pendingError.message}`)
          results.failed++
        } else {
          results.success++
          results.invitationsSent++
          results.pendingData.push(pendingDriverData)
        }
      } catch (err) {
        results.errors.push(`Error processing ${record.full_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.failed++
      }
    }

    return NextResponse.json({
      message: `Sent ${results.invitationsSent} invitations successfully. ${results.failed} failed. Drivers will be added to ${transportCompany.company_name} when they accept invitations.`,
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


