import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

interface CSVPincode {
  code: string
  city_name: string
  state_name: string
  country_name: string
}

// Parse CSV string to array of objects
function parseCSV(csvText: string): CSVPincode[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const records: CSVPincode[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || ''
    })
    records.push(record as unknown as CSVPincode)
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

export async function POST(request: NextRequest) {
  try {
    // Check authentication + admin authorization
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const csvText = await file.text()
    const records = parseCSV(csvText)

    if (records.length === 0) {
      return NextResponse.json({ error: 'No valid records found in CSV' }, { status: 400 })
    }

    const supabase = await createClient()
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    }

    for (const record of records) {
      try {
        // Validate required fields
        if (!record.code || record.code.trim() === '') {
          results.failed++
          results.errors.push(`Missing pincode`)
          continue
        }

        if (!record.city_name || record.city_name.trim() === '') {
          results.failed++
          results.errors.push(`Missing city name for pincode "${record.code}"`)
          continue
        }

        if (!record.state_name || record.state_name.trim() === '') {
          results.failed++
          results.errors.push(`Missing state name for pincode "${record.code}"`)
          continue
        }

        if (!record.country_name || record.country_name.trim() === '') {
          results.failed++
          results.errors.push(`Missing country name for pincode "${record.code}"`)
          continue
        }

        // Lookup country ID
        const { data: country } = await supabase
          .from('countries')
          .select('id')
          .ilike('name', record.country_name.trim())
          .single()

        if (!country) {
          results.failed++
          results.errors.push(`Country "${record.country_name}" not found for pincode "${record.code}"`)
          continue
        }

        // Lookup state ID
        const { data: state } = await supabase
          .from('states')
          .select('id')
          .eq('country_id', country.id)
          .ilike('name', record.state_name.trim())
          .single()

        if (!state) {
          results.failed++
          results.errors.push(`State "${record.state_name}" not found in "${record.country_name}" for pincode "${record.code}"`)
          continue
        }

        // Lookup city ID
        const { data: city } = await supabase
          .from('cities')
          .select('id')
          .eq('state_id', state.id)
          .ilike('name', record.city_name.trim())
          .single()

        if (!city) {
          results.failed++
          results.errors.push(`City "${record.city_name}" not found in "${record.state_name}" for pincode "${record.code}"`)
          continue
        }

        // Check if pincode already exists
        const { data: existing } = await supabase
          .from('pincodes')
          .select('id')
          .eq('code', record.code.trim())
          .single()

        if (existing) {
          results.failed++
          results.errors.push(`Pincode "${record.code}" already exists`)
          continue
        }

        // Create pincode
        const { error: pincodeError } = await supabase
          .from('pincodes')
          .insert([{
            code: record.code.trim(),
            city_id: city.id
          }])

        if (pincodeError) {
          results.failed++
          results.errors.push(`Failed to create pincode "${record.code}": ${pincodeError.message}`)
          continue
        }

        results.successful++
      } catch (error: any) {
        results.failed++
        results.errors.push(`Error processing pincode "${record.code}": ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.total} pincodes: ${results.successful} successful, ${results.failed} failed`,
      results
    })
  } catch (error: any) {
    console.error('Error uploading pincodes CSV:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload CSV' },
      { status: 500 }
    )
  }
}

