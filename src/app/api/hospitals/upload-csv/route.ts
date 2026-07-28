import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth/requireAdmin'

interface CSVHospital {
  name: string
  hospital_type: string
  address_line: string
  phone: string
  email?: string
  website?: string
  emergency_contact_person: string
  emergency_contact_phone: string
  emergency_contact_email?: string
  latitude?: string
  longitude?: string
  general_operating_hours?: string
  emergency_department_hours?: string
  additional_notes?: string
  status?: string
  city_name?: string
  state_name?: string
  country_name?: string
  pincode?: string
}

// Parse CSV string to array of objects
function parseCSV(csvText: string): CSVHospital[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const records: CSVHospital[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || ''
    })
    records.push(record as unknown as CSVHospital)
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
async function lookupLocationIds(record: CSVHospital) {
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
  // Admin-only write (bulk insert)
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
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

    const results = { success: 0, failed: 0, errors: [] as string[] }

    for (const record of records) {
      try {
        // Validate required fields
        if (!record.name || !record.hospital_type || !record.address_line || 
            !record.phone || !record.emergency_contact_person || !record.emergency_contact_phone) {
          results.errors.push(`Row missing required fields: ${record.name || 'Unknown'}`)
          results.failed++
          continue
        }

        // Lookup location IDs
        const locationIds = await lookupLocationIds(record)

        // Prepare hospital data
        const hospitalData = {
          name: record.name,
          hospital_type: record.hospital_type.toLowerCase() as 'government' | 'private' | 'specialty' | 'other',
          address_line: record.address_line,
          phone: record.phone,
          email: record.email || null,
          website: record.website || null,
          emergency_contact_person: record.emergency_contact_person,
          emergency_contact_phone: record.emergency_contact_phone,
          emergency_contact_email: record.emergency_contact_email || null,
          latitude: record.latitude ? parseFloat(record.latitude) : null,
          longitude: record.longitude ? parseFloat(record.longitude) : null,
          general_operating_hours: record.general_operating_hours || null,
          emergency_department_hours: record.emergency_department_hours || null,
          additional_notes: record.additional_notes || null,
          status: (record.status?.toLowerCase() || 'active') as 'active' | 'inactive' | 'under_review' | 'suspended',
          ...locationIds
        }

        const { error } = await supabase.from('hospitals').insert(hospitalData)

        if (error) {
          results.errors.push(`Failed to insert ${record.name}: ${error.message}`)
          results.failed++
        } else {
          results.success++
        }
      } catch (err) {
        results.errors.push(`Error processing ${record.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.failed++
      }
    }

    return NextResponse.json({
      message: `Imported ${results.success} hospitals successfully. ${results.failed} failed.`,
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

