import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthedUser } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check for test mode
    const { searchParams } = new URL(request.url)
    // SECURITY: the ?test=true bypass (unauthenticated, picks an arbitrary transport company)
    // must NEVER be honored in production — it would expose real data unauthenticated.
    const testMode = process.env.NODE_ENV !== 'production' && searchParams.get('test') === 'true'

    let transportCompany: any

    if (testMode) {
      console.log('Running in test mode - finding any transport company')

      // Find any transport company for testing
      const { data: anyCompany, error: companyError } = await supabase
        .from('transport_companies')
        .select('user_id, company_name')
        .limit(1)
        .single()

      if (companyError || !anyCompany) {
        console.error('No transport companies found in database:', companyError)
        return NextResponse.json({
          success: true,
          drivers: [],
          message: 'No transport companies exist in the database'
        })
      }

      transportCompany = anyCompany
      console.log('Using test transport company:', transportCompany.company_name)
    } else {
      // Normal authentication flow
      const { user, appUser } = await getAuthedUser()
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      // appUser IS the caller's public.users row
      if (!appUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      const currentUser: any = appUser

      if (currentUser.role !== 'transport_company') {
        return NextResponse.json(
          { error: 'Only transport companies can access this endpoint' },
          { status: 403 }
        )
      }

      // Get transport company for this user
      const { data: company, error: companyError } = await supabase
        .from('transport_companies')
        .select('user_id, company_name')
        .eq('user_id', currentUser.id)
        .single()

      if (companyError || !company) {
        console.error('Transport company error:', companyError)
        return NextResponse.json(
          { error: 'Transport company not found', details: companyError?.message },
          { status: 404 }
        )
      }

      transportCompany = company
    }

    // Get all drivers for this transport company with their user info
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select(`
        user_id,
        license_number,
        status,
        is_verified,
        users!drivers_user_id_fkey (
          id,
          full_name,
          email,
          phone
        )
      `)
      .eq('transport_company_id', transportCompany.user_id)

    if (driversError) {
      console.error('Error fetching drivers:', driversError)
      return NextResponse.json(
        {
          error: 'Failed to fetch drivers from database',
          details: driversError.message,
          success: false
        },
        { status: 500 }
      )
    }

    if (!drivers || drivers.length === 0) {
      console.log('No drivers found for transport company:', transportCompany.user_id)
      return NextResponse.json({
        success: true,
        drivers: [],
        message: 'No drivers found for this transport company'
      })
    }

    console.log(`Found ${drivers.length} drivers for transport company:`, transportCompany.company_name)

    // Get performance data for each driver
    const driverPerformance = await Promise.all(
      drivers.map(async (driver: any) => {
        // Get total trips for this driver
        const { count: totalTrips } = await supabase
          .from('sos_requests')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_driver_id', driver.user_id)

        // Get completed trips
        const { count: completedTrips } = await supabase
          .from('sos_requests')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_driver_id', driver.user_id)
          .eq('status', 'completed')

        // Get trips this month
        const firstDayOfMonth = new Date()
        firstDayOfMonth.setDate(1)
        firstDayOfMonth.setHours(0, 0, 0, 0)

        const { count: tripsThisMonth } = await supabase
          .from('sos_requests')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_driver_id', driver.user_id)
          .gte('requested_at', firstDayOfMonth.toISOString())

        // Get last month's trips for comparison
        const firstDayOfLastMonth = new Date()
        firstDayOfLastMonth.setMonth(firstDayOfLastMonth.getMonth() - 1)
        firstDayOfLastMonth.setDate(1)
        firstDayOfLastMonth.setHours(0, 0, 0, 0)

        const { count: tripsLastMonth } = await supabase
          .from('sos_requests')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_driver_id', driver.user_id)
          .gte('requested_at', firstDayOfLastMonth.toISOString())
          .lt('requested_at', firstDayOfMonth.toISOString())

        // Calculate average response time
        const { data: completedSOS } = await supabase
          .from('sos_requests')
          .select('requested_at, assigned_at')
          .eq('assigned_driver_id', driver.user_id)
          .eq('status', 'completed')
          .not('assigned_at', 'is', null)
          .limit(20)

        let avgResponseTime = 'N/A'
        if (completedSOS && completedSOS.length > 0) {
          const totalResponseTime = completedSOS.reduce((sum, sos) => {
            const requested = new Date(sos.requested_at)
            const assigned = new Date(sos.assigned_at!)
            const diffMinutes = (assigned.getTime() - requested.getTime()) / (1000 * 60)
            return sum + diffMinutes
          }, 0)
          const avgMinutes = totalResponseTime / completedSOS.length
          avgResponseTime = `${avgMinutes.toFixed(1)} min`
        }

        // Calculate on-time percentage (completed vs total)
        const onTimePercentage = totalTrips && totalTrips > 0
          ? Math.round(((completedTrips || 0) / totalTrips) * 100)
          : 0

        // Determine trend
        const trend = (tripsThisMonth || 0) > (tripsLastMonth || 0) ? 'up' :
                     (tripsThisMonth || 0) < (tripsLastMonth || 0) ? 'down' : 'stable'

        return {
          id: driver.user_id,
          name: driver.users?.full_name || 'Unknown',
          email: driver.users?.email || '',
          phone: driver.users?.phone || '',
          employeeId: driver.license_number,
          totalTrips: totalTrips || 0,
          completedTrips: completedTrips || 0,
          avgResponseTime,
          onTimePercentage,
          status: driver.status,
          isVerified: driver.is_verified,
          trend,
          lastMonth: {
            trips: tripsLastMonth || 0
          }
        }
      })
    )

    return NextResponse.json({
      success: true,
      drivers: driverPerformance
    })
  } catch (error) {
    console.error('Error fetching driver performance:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch driver performance',
        success: false 
      },
      { status: 500 }
    )
  }
}

