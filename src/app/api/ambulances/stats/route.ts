import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthedUser } from '@/lib/supabase/server'

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

    // Get total ambulances count
    const { count: totalAmbulances } = await supabase
      .from('ambulances')
      .select('*', { count: 'exact', head: true })

    // Get available ambulances
    const { count: availableAmbulances } = await supabase
      .from('ambulances')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available')

    // Get dispatched ambulances
    const { count: dispatchedAmbulances } = await supabase
      .from('ambulances')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'dispatched')

    // Get maintenance ambulances
    const { count: maintenanceAmbulances } = await supabase
      .from('ambulances')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'maintenance')

    // Get ambulances by equipment level
    const { data: ambulancesByEquipment } = await supabase
      .from('ambulances')
      .select('equipment_level')

    const equipmentDistribution = ambulancesByEquipment?.reduce((acc: Record<string, number>, ambulance) => {
      acc[ambulance.equipment_level] = (acc[ambulance.equipment_level] || 0) + 1
      return acc
    }, {}) || {}

    // Get ambulances by transport company
    const { data: ambulancesByCompany } = await supabase
      .from('ambulances')
      .select(`
        transport_companies (
          company_name
        )
      `)

    const companyDistribution = ambulancesByCompany?.reduce((acc: Record<string, number>, ambulance: any) => {
      const companyName = ambulance.transport_companies?.company_name || 'Unknown'
      acc[companyName] = (acc[companyName] || 0) + 1
      return acc
    }, {}) || {}

    const stats = {
      total: totalAmbulances || 0,
      available: availableAmbulances || 0,
      dispatched: dispatchedAmbulances || 0,
      maintenance: maintenanceAmbulances || 0,
      equipmentDistribution,
      companyDistribution,
      utilizationRate: (totalAmbulances || 0) > 0 ?
        (((dispatchedAmbulances || 0) / (totalAmbulances || 1)) * 100).toFixed(1) : '0'
    }

    return NextResponse.json({
      stats,
      success: true
    })
  } catch (error) {
    console.error('Error fetching ambulance stats:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch ambulance stats',
        success: false 
      },
      { status: 500 }
    )
  }
}
