import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthedUser } from '@/lib/supabase/server'

// GET /api/transport/reports - Get performance reports for the transport company
export async function GET(request: NextRequest) {
  try {
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // appUser IS the caller's public.users row
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentUser: any = appUser
    const supabase = await createClient()

    if (currentUser.role !== 'transport_company') {
      return NextResponse.json({
        error: 'Forbidden - Transport company access required'
      }, { status: 403 })
    }

    // Get transport company for this user
    const { data: transportCompany, error: companyError } = await supabase
      .from('transport_companies')
      .select('user_id, company_name')
      .eq('user_id', currentUser.id)
      .single()

    if (companyError || !transportCompany) {
      console.error('Transport company error:', companyError)
      return NextResponse.json({
        error: 'Transport company not found',
        details: companyError?.message
      }, { status: 404 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month' // week, month, quarter, year

    // Calculate date range based on period
    const now = new Date()
    const startDate = new Date()

    const daysMap = {
      week: 7,
      month: 30,
      quarter: 90,
      year: 365
    }

    startDate.setDate(now.getDate() - (daysMap[period as keyof typeof daysMap] || 30))

    // Get all drivers for this transport company
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select(`
        user_id,
        status,
        is_verified,
        license_number,
        users!drivers_user_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('transport_company_id', transportCompany.user_id)

    if (driversError) {
      console.error('Error fetching drivers for reports:', driversError)
      return NextResponse.json({
        error: 'Failed to fetch drivers',
        details: driversError.message
      }, { status: 500 })
    }

    // Get all SOS requests assigned to this company's drivers
    const driverIds = drivers?.map(d => d.user_id) || []

    let sosRequests: any[] = []
    if (driverIds.length > 0) {
      const { data, error: sosError } = await supabase
        .from('sos_requests')
        .select(`
          id,
          status,
          requested_at,
          assigned_at,
          completed_at,
          assigned_driver_id
        `)
        .in('assigned_driver_id', driverIds)
        .gte('requested_at', startDate.toISOString())
        .order('requested_at', { ascending: false })

      if (sosError) {
        console.error('Error fetching SOS requests for reports:', sosError)
      } else {
        sosRequests = data || []
      }
    }

    // Calculate performance metrics
    const totalRequests = sosRequests.length
    const completedRequests = sosRequests.filter(r => r.status === 'completed').length
    const activeDrivers = drivers?.filter(d => d.status === 'available' || d.status === 'on_trip' || d.status === 'assigned').length || 0
    const totalDrivers = drivers?.length || 0

    // Calculate real average response time (time from requested to assigned)
    const requestsWithResponseTime = sosRequests.filter(r => r.requested_at && r.assigned_at)
    let avgResponseTime = 0

    if (requestsWithResponseTime.length > 0) {
      const totalResponseTime = requestsWithResponseTime.reduce((sum, r) => {
        const requested = new Date(r.requested_at).getTime()
        const assigned = new Date(r.assigned_at).getTime()
        return sum + (assigned - requested)
      }, 0)
      avgResponseTime = Math.round(totalResponseTime / requestsWithResponseTime.length / 60000) // Convert to minutes
    }

    const completionRate = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0

    // Generate real time-series data from actual SOS requests
    const generateTimeSeriesData = (days: number) => {
      const data = []
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]

        // Filter requests for this specific date
        const dayRequests = sosRequests.filter(r => {
          const reqDate = new Date(r.requested_at).toISOString().split('T')[0]
          return reqDate === dateStr
        })

        const dayCompleted = dayRequests.filter(r => r.status === 'completed').length

        // Calculate average response time for this day
        const dayRequestsWithTime = dayRequests.filter(r => r.requested_at && r.assigned_at)
        let dayResponseTime = 0

        if (dayRequestsWithTime.length > 0) {
          const totalTime = dayRequestsWithTime.reduce((sum, r) => {
            const requested = new Date(r.requested_at).getTime()
            const assigned = new Date(r.assigned_at).getTime()
            return sum + (assigned - requested)
          }, 0)
          dayResponseTime = Math.round(totalTime / dayRequestsWithTime.length / 60000)
        }

        data.push({
          date: dateStr,
          requests: dayRequests.length,
          completed: dayCompleted,
          response_time: dayResponseTime
        })
      }
      return data
    }

    const timeSeriesData = generateTimeSeriesData(daysMap[period as keyof typeof daysMap] || 30)

    // Calculate real driver performance data
    const driverPerformance = drivers?.map((driver: any) => {
      // Get all SOS requests for this driver
      const driverRequests = sosRequests.filter(r => r.assigned_driver_id === driver.user_id)
      const driverCompleted = driverRequests.filter(r => r.status === 'completed')

      // Calculate average response time for this driver
      const driverRequestsWithTime = driverRequests.filter(r => r.requested_at && r.assigned_at)
      let driverAvgResponseTime = 0

      if (driverRequestsWithTime.length > 0) {
        const totalTime = driverRequestsWithTime.reduce((sum, r) => {
          const requested = new Date(r.requested_at).getTime()
          const assigned = new Date(r.assigned_at).getTime()
          return sum + (assigned - requested)
        }, 0)
        driverAvgResponseTime = Math.round(totalTime / driverRequestsWithTime.length / 60000)
      }

      return {
        id: driver.user_id,
        name: driver.users?.full_name || 'Unknown Driver',
        email: driver.users?.email || '',
        total_trips: driverRequests.length,
        completed_trips: driverCompleted.length,
        avg_response_time: driverAvgResponseTime,
        rating: '4.5', // TODO: Implement real rating system
        status: driver.status
      }
    }) || []

    // Calculate fleet utilization based on driver status
    const availableDrivers = drivers?.filter(d => d.status === 'available').length || 0
    const assignedDrivers = drivers?.filter(d => d.status === 'assigned').length || 0
    const onTripDrivers = drivers?.filter(d => d.status === 'on_trip').length || 0
    const inactiveDrivers = drivers?.filter(d => d.status === 'inactive').length || 0

    const fleetUtilization = [
      {
        vehicle_type: 'Available',
        total: totalDrivers,
        active: availableDrivers,
        utilization: totalDrivers > 0 ? Math.round((availableDrivers / totalDrivers) * 100) : 0
      },
      {
        vehicle_type: 'Assigned',
        total: totalDrivers,
        active: assignedDrivers,
        utilization: totalDrivers > 0 ? Math.round((assignedDrivers / totalDrivers) * 100) : 0
      },
      {
        vehicle_type: 'On Trip',
        total: totalDrivers,
        active: onTripDrivers,
        utilization: totalDrivers > 0 ? Math.round((onTripDrivers / totalDrivers) * 100) : 0
      },
      {
        vehicle_type: 'Inactive',
        total: totalDrivers,
        active: inactiveDrivers,
        utilization: totalDrivers > 0 ? Math.round((inactiveDrivers / totalDrivers) * 100) : 0
      }
    ]

    // Calculate revenue data (using $150 average per trip)
    const avgTripValue = 150
    const totalRevenue = completedRequests * avgTripValue

    // Calculate previous period for growth comparison
    const prevPeriodStart = new Date(startDate)
    prevPeriodStart.setDate(prevPeriodStart.getDate() - (daysMap[period as keyof typeof daysMap] || 30))

    const { data: prevPeriodRequests } = await supabase
      .from('sos_requests')
      .select('id, status')
      .in('assigned_driver_id', driverIds)
      .gte('requested_at', prevPeriodStart.toISOString())
      .lt('requested_at', startDate.toISOString())

    const prevPeriodCompleted = prevPeriodRequests?.filter(r => r.status === 'completed').length || 0
    const prevPeriodRevenue = prevPeriodCompleted * avgTripValue

    const monthlyGrowth = prevPeriodRevenue > 0
      ? Math.round(((totalRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100)
      : 0

    const revenueData = {
      total_revenue: totalRevenue,
      monthly_growth: monthlyGrowth,
      avg_trip_value: avgTripValue,
      top_revenue_drivers: driverPerformance
        .sort((a, b) => b.completed_trips - a.completed_trips)
        .slice(0, 5)
        .map(driver => ({
          id: driver.id,
          name: driver.name,
          total_trips: driver.completed_trips,
          revenue: driver.completed_trips * avgTripValue
        }))
    }

    const reportData = {
      overview: {
        total_requests: totalRequests,
        completed_requests: completedRequests,
        completion_rate: completionRate,
        avg_response_time: avgResponseTime,
        active_drivers: activeDrivers,
        total_drivers: totalDrivers,
        driver_utilization: totalDrivers > 0 ? Math.round((activeDrivers / totalDrivers) * 100) : 0
      },
      time_series: timeSeriesData,
      driver_performance: driverPerformance,
      fleet_utilization: fleetUtilization,
      revenue: revenueData,
      period: period
    }

    return NextResponse.json({
      reports: reportData,
      success: true
    })
  } catch (error) {
    console.error('Error fetching transport company reports:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch performance reports',
        success: false 
      },
      { status: 500 }
    )
  }
}
