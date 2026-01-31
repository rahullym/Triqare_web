import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'

// Google Places API endpoint
const GOOGLE_PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place'

// Helper to send SSE progress updates
function sendProgress(controller: ReadableStreamDefaultController, data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(message))
}

interface GooglePlaceResult {
  place_id: string
  name: string
  formatted_address: string
  geometry: {
    location: {
      lat: number
      lng: number
    }
  }
  formatted_phone_number?: string
  website?: string
  opening_hours?: {
    weekday_text?: string[]
  }
  types: string[]
  rating?: number
  user_ratings_total?: number
}

interface PlaceDetails {
  result: GooglePlaceResult
}

export async function POST(request: NextRequest) {
  // Check authentication first
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is admin
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const userRole = user.publicMetadata?.role

  if (userRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 })
  }

  const body = await request.json()
  const {
    location = 'Kerala, India',
    countryId,
    stateId,
    radius = 50000,
    maxResults = 60
  } = body

  // Validate required parameters
  if (!stateId) {
    return NextResponse.json({ error: 'State ID is required' }, { status: 400 })
  }

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const supabase = await createClient()

        // Send initial progress
        sendProgress(controller, {
          type: 'progress',
          stage: 'initializing',
          message: 'Initializing scraping process...',
          progress: 0
        })

        // Get the selected state and country for location mapping
        const { data: selectedState, error: stateError } = await supabase
          .from('states')
          .select('id, name, country_id')
          .eq('id', stateId)
          .single()

        if (stateError || !selectedState) {
          sendProgress(controller, {
            type: 'error',
            message: 'State not found in database'
          })
          controller.close()
          return
        }

        // Get cities for the selected state
        const { data: stateCities } = await supabase
          .from('cities')
          .select('id, name, state_id')
          .eq('state_id', selectedState.id)

        sendProgress(controller, {
          type: 'progress',
          stage: 'fetching',
          message: `Searching for hospitals in ${location}...`,
          progress: 10
        })

        const results = {
          success: 0,
          failed: 0,
          skipped: 0,
          errors: [] as string[]
        }

        // Search for hospitals in selected location
        const searchUrl = `${GOOGLE_PLACES_API_URL}/textsearch/json?query=hospitals+in+${encodeURIComponent(location)}&key=${apiKey}`

        let allPlaces: GooglePlaceResult[] = []
        let nextPageToken: string | undefined = undefined
        let pageCount = 0
        const maxPages = Math.ceil(maxResults / 20) // Google returns max 20 results per page

        // Fetch multiple pages of results
        do {
          const url: string = nextPageToken
            ? `${searchUrl}&pagetoken=${nextPageToken}`
            : searchUrl

          sendProgress(controller, {
            type: 'progress',
            stage: 'fetching',
            message: `Fetching page ${pageCount + 1} from Google Places...`,
            progress: 10 + (pageCount * 10)
          })

          const response = await fetch(url)
          const data = await response.json()

          if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            results.errors.push(`Google API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
            break
          }

          if (data.results && data.results.length > 0) {
            allPlaces = allPlaces.concat(data.results)
            sendProgress(controller, {
              type: 'progress',
              stage: 'fetching',
              message: `Found ${allPlaces.length} hospitals so far...`,
              progress: 10 + (pageCount * 10)
            })
          }

          nextPageToken = data.next_page_token
          pageCount++

          // Wait 2 seconds before next page (Google requirement)
          if (nextPageToken && pageCount < maxPages) {
            sendProgress(controller, {
              type: 'progress',
              stage: 'waiting',
              message: 'Waiting for next page (Google API requirement)...',
              progress: 10 + (pageCount * 10)
            })
            await new Promise(resolve => setTimeout(resolve, 2000))
          }

        } while (nextPageToken && pageCount < maxPages && allPlaces.length < maxResults)

        // Limit to maxResults
        allPlaces = allPlaces.slice(0, maxResults)

        sendProgress(controller, {
          type: 'progress',
          stage: 'processing',
          message: `Found ${allPlaces.length} hospitals. Starting import...`,
          progress: 40,
          total: allPlaces.length
        })

        console.log(`Found ${allPlaces.length} hospitals from Google Places API`)

        // Process each hospital
        let processedCount = 0
        for (const place of allPlaces) {
          try {
            processedCount++
            const progressPercent = 40 + Math.floor((processedCount / allPlaces.length) * 50)

            sendProgress(controller, {
              type: 'progress',
              stage: 'processing',
              message: `Processing ${place.name} (${processedCount}/${allPlaces.length})...`,
              progress: progressPercent,
              current: processedCount,
              total: allPlaces.length,
              hospitalName: place.name
            })

            // Check if hospital already exists by name
            const { data: existingHospital } = await supabase
              .from('hospitals')
              .select('id')
              .ilike('name', place.name)
              .single()

            if (existingHospital) {
              results.skipped++
              sendProgress(controller, {
                type: 'skip',
                message: `Skipped: ${place.name} (already exists)`,
                hospitalName: place.name
              })
              continue
            }

            // Get detailed information
            const detailsUrl = `${GOOGLE_PLACES_API_URL}/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,opening_hours,geometry&key=${apiKey}`
            const detailsResponse = await fetch(detailsUrl)
            const detailsData: PlaceDetails = await detailsResponse.json()
            const details = detailsData.result || place

            // Extract city from address
            let cityId = null
            if (stateCities && details.formatted_address) {
              const city = stateCities.find(c =>
                details.formatted_address.toLowerCase().includes(c.name.toLowerCase())
              )
              if (city) cityId = city.id
            }

            // Prepare hospital data
            const hospitalData = {
              name: details.name,
              hospital_type: 'private' as const, // Default to private, can be updated manually
              address_line: details.formatted_address || '',
              phone: details.formatted_phone_number || 'Not available',
              email: null,
              website: details.website || null,
              emergency_contact_person: 'Reception', // Default value
              emergency_contact_phone: details.formatted_phone_number || 'Not available',
              emergency_contact_email: null,
              country_id: selectedState.country_id || null,
              state_id: selectedState.id,
              city_id: cityId,
              pincode_id: null,
              latitude: details.geometry.location.lat,
              longitude: details.geometry.location.lng,
              general_operating_hours: details.opening_hours?.weekday_text?.join(', ') || null,
              emergency_department_hours: '24/7', // Assume 24/7 for hospitals
              additional_notes: `Imported from Google Places. Rating: ${place.rating || 'N/A'}, Reviews: ${place.user_ratings_total || 0}`,
              status: 'active' as const
            }

            const { error } = await supabase.from('hospitals').insert(hospitalData)

            if (error) {
              results.errors.push(`Failed to insert ${place.name}: ${error.message}`)
              results.failed++
              sendProgress(controller, {
                type: 'error',
                message: `Failed: ${place.name}`,
                hospitalName: place.name,
                error: error.message
              })
            } else {
              results.success++
              sendProgress(controller, {
                type: 'success',
                message: `Imported: ${place.name}`,
                hospitalName: place.name
              })
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100))

          } catch (err) {
            results.errors.push(`Error processing ${place.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            results.failed++
            sendProgress(controller, {
              type: 'error',
              message: `Error: ${place.name}`,
              hospitalName: place.name,
              error: err instanceof Error ? err.message : 'Unknown error'
            })
          }
        }

        // Send completion message
        sendProgress(controller, {
          type: 'complete',
          stage: 'complete',
          message: `Scraping complete! Imported ${results.success}, Skipped ${results.skipped}, Failed ${results.failed}`,
          progress: 100,
          results: {
            success: results.success,
            skipped: results.skipped,
            failed: results.failed,
            total: allPlaces.length,
            errors: results.errors
          }
        })

        controller.close()

      } catch (error: any) {
        console.error('Error scraping hospitals:', error)
        sendProgress(controller, {
          type: 'error',
          message: error.message || 'Failed to scrape hospitals',
          error: error.message
        })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

