import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const supabase = createServerClient()

    // Fetch all data needed for comprehensive analytics
    // Based on DATABASE_SCHEMA_DOCUMENTATION.md columns
    const [
      usersResult,
      sosRequestsResult,
      driversResult,
      hospitalsResult,
      patientsResult,
      transportCompaniesResult,
      subscriptionsResult,
      billingResult
    ] = await Promise.all([
      supabase.from('users').select('id, full_name, email, role, created_at, updated_at'),
      // sos_requests: id, patient_id, status, requested_at, assigned_at, completed_at, auto_assigned (no severity or created_at column)
      supabase.from('sos_requests').select('id, patient_id, status, requested_at, assigned_at, completed_at, auto_assigned'),
      // drivers: user_id is primary key, status: available/assigned/on_trip/inactive
      supabase.from('drivers').select('user_id, status, is_verified, transport_company_id, created_at'),
      // hospitals: status: active/inactive/under_review/suspended
      supabase.from('hospitals').select('id, name, status, created_at'),
      supabase.from('patients').select('user_id, created_at'),
      // transport_companies: user_id is primary key
      supabase.from('transport_companies').select('user_id, company_name, is_verified, created_at'),
      // patient_subscriptions: status: active/expired/cancelled
      supabase.from('patient_subscriptions').select('id, patient_id, status, start_date, end_date, created_at'),
      // billing_history: status: pending/paid/failed/refunded
      supabase.from('billing_history').select('id, amount, status, created_at')
    ])

    // Check for critical errors
    if (usersResult.error) throw usersResult.error
    if (sosRequestsResult.error) throw sosRequestsResult.error

    const users = usersResult.data || []
    const sosRequests = sosRequestsResult.data || []
    const drivers = driversResult.data || []
    const hospitals = hospitalsResult.data || []
    const patients = patientsResult.data || []
    const transportCompanies = transportCompaniesResult.data || []
    const subscriptions = subscriptionsResult.data || []
    const billing = billingResult.data || []

    // Time calculations
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // User activity trends (last 30 days)
    const userActivityTrends = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

      userActivityTrends.push({
        date: dateStr,
        newUsers: users.filter(u => {
          const created = new Date(u.created_at)
          return created >= dayStart && created < dayEnd
        }).length,
        sosRequests: sosRequests.filter(s => {
          const created = new Date(s.requested_at)
          return created >= dayStart && created < dayEnd
        }).length
      })
    }

    // SOS trends by status (severity column doesn't exist in schema)
    const sosByStatus = sosRequests.reduce((acc, sos) => {
      const status = sos.status || 'unknown'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Driver statistics - based on actual status values: available/assigned/on_trip/inactive
    const driverStats = {
      total: drivers.length,
      available: drivers.filter(d => d.status === 'available').length,
      assigned: drivers.filter(d => d.status === 'assigned').length,
      onTrip: drivers.filter(d => d.status === 'on_trip').length,
      inactive: drivers.filter(d => d.status === 'inactive').length,
      verified: drivers.filter(d => d.is_verified).length,
      unverified: drivers.filter(d => !d.is_verified).length,
      newThisWeek: drivers.filter(d => new Date(d.created_at) >= oneWeekAgo).length
    }

    // Hospital statistics
    const hospitalStats = {
      total: hospitals.length,
      active: hospitals.filter(h => h.status === 'active').length,
      inactive: hospitals.filter(h => h.status !== 'active').length,
      newThisMonth: hospitals.filter(h => new Date(h.created_at) >= oneMonthAgo).length
    }

    // Transport company statistics
    const transportStats = {
      total: transportCompanies.length,
      verified: transportCompanies.filter(tc => tc.is_verified).length,
      unverified: transportCompanies.filter(tc => !tc.is_verified).length,
      newThisMonth: transportCompanies.filter(tc => new Date(tc.created_at) >= oneMonthAgo).length
    }

    // Subscription statistics
    const subscriptionStats = {
      total: subscriptions.length,
      active: subscriptions.filter(s => s.status === 'active').length,
      expired: subscriptions.filter(s => s.status === 'expired').length,
      cancelled: subscriptions.filter(s => s.status === 'cancelled').length
    }

    // Revenue statistics - billing status: pending/paid/failed/refunded
    const totalRevenue = billing.filter(b => b.status === 'paid').reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0)
    const thisMonthRevenue = billing.filter(b => b.status === 'paid' && new Date(b.created_at) >= oneMonthAgo).reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0)

    // Recent users (last 10 registrations)
    const recentUsers = users
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(u => ({
        id: u.id,
        name: u.full_name,
        email: u.email,
        role: u.role,
        joinedAt: u.created_at
      }))

    // Recent SOS requests (last 10) - no severity or created_at column in schema
    const recentSOS = sosRequests
      .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
      .slice(0, 10)
      .map(s => ({
        id: s.id,
        status: s.status,
        requestedAt: s.requested_at,
        autoAssigned: s.auto_assigned
      }))

    // Calculate average response time
    const completedSOS = sosRequests.filter(s => s.status === 'Completed' && s.assigned_at && s.requested_at)
    const avgResponseTime = completedSOS.length > 0
      ? completedSOS.reduce((sum, s) => {
          const diff = (new Date(s.assigned_at!).getTime() - new Date(s.requested_at!).getTime()) / 60000
          return sum + diff
        }, 0) / completedSOS.length
      : 0

    // Generate SOS heatmap data (day of week x hour)
    const sosHeatmap: Array<{ day: number; hour: number; value: number }> = []
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        sosHeatmap.push({ day, hour, value: 0 })
      }
    }
    sosRequests.forEach(sos => {
      const date = new Date(sos.requested_at)
      const day = date.getDay()
      const hour = date.getHours()
      const idx = day * 24 + hour
      if (sosHeatmap[idx]) sosHeatmap[idx].value++
    })

    // Peak hours analysis
    const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sosCount: sosRequests.filter(s => new Date(s.requested_at).getHours() === hour).length,
      userCount: users.filter(u => new Date(u.created_at).getHours() === hour).length
    }))

    // Weekly pattern analysis
    const weeklyPattern = Array.from({ length: 7 }, (_, day) => {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return {
        day: dayNames[day],
        sosCount: sosRequests.filter(s => new Date(s.requested_at).getDay() === day).length,
        avgResponseTime: (() => {
          const daySOS = sosRequests.filter(s =>
            new Date(s.requested_at).getDay() === day &&
            s.status === 'Completed' && s.assigned_at && s.requested_at
          )
          if (daySOS.length === 0) return 0
          return daySOS.reduce((sum, s) => {
            return sum + (new Date(s.assigned_at!).getTime() - new Date(s.requested_at!).getTime()) / 60000
          }, 0) / daySOS.length
        })()
      }
    })

    // System health metrics - use correct status values
    const activeDrivers = driverStats.available + driverStats.assigned + driverStats.onTrip
    const systemHealth = {
      driverAvailability: drivers.length > 0 ? (driverStats.available / drivers.length) * 100 : 0,
      hospitalCapacity: hospitals.length > 0 ? (hospitalStats.active / hospitals.length) * 100 : 0,
      sosCompletionRate: sosRequests.length > 0
        ? (sosRequests.filter(s => s.status === 'Completed').length / sosRequests.length) * 100
        : 0,
      subscriptionHealth: subscriptions.length > 0
        ? (subscriptionStats.active / subscriptions.length) * 100
        : 0
    }

    // Build comprehensive analytics
    const analytics = {
      usersByRole: users.reduce((acc, user) => {
        const role = user.role || 'unknown'
        acc[role] = (acc[role] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      totalUsers: users.length,
      sosStatistics: {
        total: sosRequests.length,
        active: sosRequests.filter(sos =>
          ['SOS Triggered', 'Driver Assigned', 'Driver En Route', 'Patient Picked Up', 'At Hospital'].includes(sos.status)
        ).length,
        completed: sosRequests.filter(sos => sos.status === 'Completed').length,
        cancelled: sosRequests.filter(sos => sos.status === 'Cancelled').length,
        byStatus: sosByStatus,
        avgResponseTime: avgResponseTime.toFixed(1),
        todayCount: sosRequests.filter(s => new Date(s.requested_at) >= today).length
      },
      recentActivity: {
        newUsersThisWeek: users.filter(user => new Date(user.created_at) >= oneWeekAgo).length,
        sosRequestsThisWeek: sosRequests.filter(sos => new Date(sos.requested_at) >= oneWeekAgo).length,
        newUsersToday: users.filter(user => new Date(user.created_at) >= today).length,
        sosRequestsToday: sosRequests.filter(sos => new Date(sos.requested_at) >= today).length
      },
      userActivityTrends,
      driverStats,
      hospitalStats,
      transportStats,
      patientStats: {
        total: patients.length,
        newThisWeek: patients.filter(p => new Date(p.created_at) >= oneWeekAgo).length,
        newThisMonth: patients.filter(p => new Date(p.created_at) >= oneMonthAgo).length
      },
      subscriptionStats,
      revenueStats: {
        totalRevenue,
        thisMonthRevenue,
        transactionCount: billing.length
      },
      recentUsers,
      recentSOS,
      sosHeatmap,
      hourlyActivity,
      weeklyPattern,
      systemHealth,
      driverFleetStats: {
        total: drivers.length,
        available: drivers.filter(d => d.status === 'available').length,
        assigned: drivers.filter(d => d.status === 'assigned').length,
        onTrip: drivers.filter(d => d.status === 'on_trip').length,
        inactive: drivers.filter(d => d.status === 'inactive').length,
        verified: drivers.filter(d => d.is_verified).length,
        unverified: drivers.filter(d => !d.is_verified).length
      }
    }

    return NextResponse.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Analytics API Error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch analytics data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}


