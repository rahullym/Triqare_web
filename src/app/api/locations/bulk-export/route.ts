import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Check authentication + admin authorization
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const supabase = await createClient()

    // Fetch all pincodes with their hierarchical data
    const { data: pincodes, error } = await supabase
      .from('pincodes')
      .select(`
        code,
        city:cities (
          name,
          state:states (
            name,
            country:countries (
              name
            )
          )
        )
      `)
      .order('code')

    if (error) {
      console.error('Error fetching pincodes:', error)
      return NextResponse.json({ error: 'Failed to fetch location data' }, { status: 500 })
    }

    if (!pincodes || pincodes.length === 0) {
      return NextResponse.json({ 
        success: true,
        data: [],
        message: 'No location data found'
      })
    }

    // Transform data to flat structure
    const exportData = pincodes.map((pincode: any) => ({
      country_name: pincode.city?.state?.country?.name || '',
      state_name: pincode.city?.state?.name || '',
      city_name: pincode.city?.name || '',
      pincode: pincode.code || ''
    }))

    return NextResponse.json({
      success: true,
      data: exportData
    })

  } catch (error: any) {
    console.error('Error in bulk export:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to export location data' 
    }, { status: 500 })
  }
}

