import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthedUser } from '@/lib/supabase/server'

// GET /api/ambulances - Get all ambulances
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthedUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = searchParams.get('limit')

    let query = supabase
      .from('ambulances')
      .select(`
        *,
        drivers (
          id,
          first_name,
          last_name,
          phone_number
        ),
        transport_companies (
          id,
          company_name
        )
      `)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (limit) {
      query = query.limit(parseInt(limit))
    }

    const { data: ambulances, error } = await query

    if (error) {
      console.error('Error fetching ambulances:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ambulances' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ambulances: ambulances || [],
      success: true
    })
  } catch (error) {
    console.error('Error in GET /api/ambulances:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/ambulances - Create new ambulance
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthedUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createClient()
    const body = await request.json()

    const {
      vehicle_number,
      model,
      year,
      capacity,
      equipment_level,
      transport_company_id,
      driver_id,
      status = 'available'
    } = body

    // Validate required fields
    if (!vehicle_number || !model || !transport_company_id) {
      return NextResponse.json(
        { error: 'Missing required fields: vehicle_number, model, transport_company_id' },
        { status: 400 }
      )
    }

    // Check if vehicle number already exists
    const { data: existingAmbulance } = await supabase
      .from('ambulances')
      .select('id')
      .eq('vehicle_number', vehicle_number)
      .single()

    if (existingAmbulance) {
      return NextResponse.json(
        { error: 'Ambulance with this vehicle number already exists' },
        { status: 409 }
      )
    }

    // Create ambulance
    const { data: ambulance, error } = await supabase
      .from('ambulances')
      .insert({
        vehicle_number,
        model,
        year,
        capacity,
        equipment_level,
        transport_company_id,
        driver_id,
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        *,
        drivers (
          id,
          first_name,
          last_name,
          phone_number
        ),
        transport_companies (
          id,
          company_name
        )
      `)
      .single()

    if (error) {
      console.error('Error creating ambulance:', error)
      return NextResponse.json(
        { error: 'Failed to create ambulance' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ambulance,
      success: true
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/ambulances:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
