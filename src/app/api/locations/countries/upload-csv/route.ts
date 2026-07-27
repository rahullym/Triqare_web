import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

interface CSVCountry {
  name: string
}

// Parse CSV string to array of objects
function parseCSV(csvText: string): CSVCountry[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const records: CSVCountry[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || ''
    })
    records.push(record as unknown as CSVCountry)
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
        if (!record.name || record.name.trim() === '') {
          results.failed++
          results.errors.push(`Missing country name`)
          continue
        }

        // Check if country already exists
        const { data: existing } = await supabase
          .from('countries')
          .select('id')
          .ilike('name', record.name.trim())
          .single()

        if (existing) {
          results.failed++
          results.errors.push(`Country "${record.name}" already exists`)
          continue
        }

        // Create country
        const { error: countryError } = await supabase
          .from('countries')
          .insert([{
            name: record.name.trim()
          }])

        if (countryError) {
          results.failed++
          results.errors.push(`Failed to create country "${record.name}": ${countryError.message}`)
          continue
        }

        results.successful++
      } catch (error: any) {
        results.failed++
        results.errors.push(`Error processing country "${record.name}": ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.total} countries: ${results.successful} successful, ${results.failed} failed`,
      results
    })
  } catch (error: any) {
    console.error('Error uploading countries CSV:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload CSV' },
      { status: 500 }
    )
  }
}

