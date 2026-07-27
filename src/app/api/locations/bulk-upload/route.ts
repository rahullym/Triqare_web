import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'

// Parse CSV content
function parseCSV(csvText: string): any[] {
  const lines = csvText.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // Handle quoted values
    const values: string[] = []
    let currentValue = ''
    let insideQuotes = false
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        insideQuotes = !insideQuotes
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim())
        currentValue = ''
      } else {
        currentValue += char
      }
    }
    values.push(currentValue.trim())
    
    const record: any = {}
    headers.forEach((header, index) => {
      record[header] = values[index] || ''
    })
    records.push(record)
  }
  
  return records
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
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 })
    }

    // Validate headers
    const requiredHeaders = ['country_name', 'state_name', 'city_name', 'pincode']
    const firstRecord = records[0]
    const missingHeaders = requiredHeaders.filter(h => !(h in firstRecord))
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        error: `Missing required columns: ${missingHeaders.join(', ')}` 
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Results tracking
    const results = {
      countries: { successful: 0, failed: 0, errors: [] as string[] },
      states: { successful: 0, failed: 0, errors: [] as string[] },
      cities: { successful: 0, failed: 0, errors: [] as string[] },
      pincodes: { successful: 0, failed: 0, errors: [] as string[] }
    }

    // Extract unique countries, states, cities
    const uniqueCountries = new Set<string>()
    const uniqueStates = new Map<string, string>() // state_name -> country_name
    const uniqueCities = new Map<string, { state_name: string, country_name: string }>()

    for (const record of records) {
      if (record.country_name) uniqueCountries.add(record.country_name.trim())
      if (record.state_name && record.country_name) {
        const key = `${record.state_name.trim()}|${record.country_name.trim()}`
        uniqueStates.set(key, record.country_name.trim())
      }
      if (record.city_name && record.state_name && record.country_name) {
        const key = `${record.city_name.trim()}|${record.state_name.trim()}|${record.country_name.trim()}`
        uniqueCities.set(key, {
          state_name: record.state_name.trim(),
          country_name: record.country_name.trim()
        })
      }
    }

    // Step 1: Create countries
    for (const countryName of uniqueCountries) {
      try {
        const { data: existing } = await supabase
          .from('countries')
          .select('id')
          .ilike('name', countryName)
          .single()

        if (existing) {
          continue // Skip existing
        }

        const { error } = await supabase
          .from('countries')
          .insert([{ name: countryName }])

        if (error) {
          results.countries.failed++
          results.countries.errors.push(`Failed to create country "${countryName}": ${error.message}`)
        } else {
          results.countries.successful++
        }
      } catch (error: any) {
        results.countries.failed++
        results.countries.errors.push(`Error creating country "${countryName}": ${error.message}`)
      }
    }

    // Step 2: Create states
    for (const [key, countryName] of uniqueStates) {
      const stateName = key.split('|')[0]
      
      try {
        // Get country ID
        const { data: country } = await supabase
          .from('countries')
          .select('id')
          .ilike('name', countryName)
          .single()

        if (!country) {
          results.states.failed++
          results.states.errors.push(`Country "${countryName}" not found for state "${stateName}"`)
          continue
        }

        // Check if state exists
        const { data: existing } = await supabase
          .from('states')
          .select('id')
          .eq('country_id', country.id)
          .ilike('name', stateName)
          .single()

        if (existing) {
          continue // Skip existing
        }

        const { error } = await supabase
          .from('states')
          .insert([{
            name: stateName,
            country_id: country.id
          }])

        if (error) {
          results.states.failed++
          results.states.errors.push(`Failed to create state "${stateName}": ${error.message}`)
        } else {
          results.states.successful++
        }
      } catch (error: any) {
        results.states.failed++
        results.states.errors.push(`Error creating state "${stateName}": ${error.message}`)
      }
    }

    // Step 3: Create cities
    for (const [key, { state_name, country_name }] of uniqueCities) {
      const cityName = key.split('|')[0]

      try {
        // Get country ID
        const { data: country } = await supabase
          .from('countries')
          .select('id')
          .ilike('name', country_name)
          .single()

        if (!country) {
          results.cities.failed++
          results.cities.errors.push(`Country "${country_name}" not found for city "${cityName}"`)
          continue
        }

        // Get state ID
        const { data: state } = await supabase
          .from('states')
          .select('id')
          .eq('country_id', country.id)
          .ilike('name', state_name)
          .single()

        if (!state) {
          results.cities.failed++
          results.cities.errors.push(`State "${state_name}" not found for city "${cityName}"`)
          continue
        }

        // Check if city exists
        const { data: existing } = await supabase
          .from('cities')
          .select('id')
          .eq('state_id', state.id)
          .ilike('name', cityName)
          .single()

        if (existing) {
          continue // Skip existing
        }

        const { error } = await supabase
          .from('cities')
          .insert([{
            name: cityName,
            state_id: state.id
          }])

        if (error) {
          results.cities.failed++
          results.cities.errors.push(`Failed to create city "${cityName}": ${error.message}`)
        } else {
          results.cities.successful++
        }
      } catch (error: any) {
        results.cities.failed++
        results.cities.errors.push(`Error creating city "${cityName}": ${error.message}`)
      }
    }

    // Step 4: Create pincodes
    for (const record of records) {
      const { country_name, state_name, city_name, pincode } = record

      if (!pincode || !pincode.trim()) {
        results.pincodes.failed++
        results.pincodes.errors.push('Missing pincode')
        continue
      }

      try {
        // Get country ID
        const { data: country } = await supabase
          .from('countries')
          .select('id')
          .ilike('name', country_name.trim())
          .single()

        if (!country) {
          results.pincodes.failed++
          results.pincodes.errors.push(`Country "${country_name}" not found for pincode "${pincode}"`)
          continue
        }

        // Get state ID
        const { data: state } = await supabase
          .from('states')
          .select('id')
          .eq('country_id', country.id)
          .ilike('name', state_name.trim())
          .single()

        if (!state) {
          results.pincodes.failed++
          results.pincodes.errors.push(`State "${state_name}" not found for pincode "${pincode}"`)
          continue
        }

        // Get city ID
        const { data: city } = await supabase
          .from('cities')
          .select('id')
          .eq('state_id', state.id)
          .ilike('name', city_name.trim())
          .single()

        if (!city) {
          results.pincodes.failed++
          results.pincodes.errors.push(`City "${city_name}" not found for pincode "${pincode}"`)
          continue
        }

        // Check if pincode exists
        const { data: existing } = await supabase
          .from('pincodes')
          .select('id')
          .eq('code', pincode.trim())
          .single()

        if (existing) {
          continue // Skip existing
        }

        const { error } = await supabase
          .from('pincodes')
          .insert([{
            code: pincode.trim(),
            city_id: city.id
          }])

        if (error) {
          results.pincodes.failed++
          results.pincodes.errors.push(`Failed to create pincode "${pincode}": ${error.message}`)
        } else {
          results.pincodes.successful++
        }
      } catch (error: any) {
        results.pincodes.failed++
        results.pincodes.errors.push(`Error creating pincode "${pincode}": ${error.message}`)
      }
    }

    const totalSuccessful = results.countries.successful + results.states.successful +
                           results.cities.successful + results.pincodes.successful
    const totalFailed = results.countries.failed + results.states.failed +
                       results.cities.failed + results.pincodes.failed

    return NextResponse.json({
      success: true,
      message: `Processed ${records.length} records: ${totalSuccessful} successful, ${totalFailed} failed`,
      results
    })

  } catch (error: any) {
    console.error('Error in bulk upload:', error)
    return NextResponse.json({
      error: error.message || 'Failed to process CSV file'
    }, { status: 500 })
  }
}

