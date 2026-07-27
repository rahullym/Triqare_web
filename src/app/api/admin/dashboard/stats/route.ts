import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const supabase = await createClient()

    // Get total users count
    const { count: totalUsers } = await supabase
      .from('user_records')
      .select('*', { count: 'exact', head: true })

    // Get total hospitals count
    const { count: totalHospitals } = await supabase
      .from('hospitals')
      .select('*', { count: 'exact', head: true })

    // Get active emergencies (SOS requests that are not completed/cancelled)
    const { count: activeEmergencies } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', '(completed,cancelled)')

    // Get total drivers count
    const { count: totalDrivers } = await supabase
      .from('drivers')
      .select('*', { count: 'exact', head: true })

    // Get system uptime (mock for now - would need real monitoring)
    const systemUptime = '99.9%'

    // Calculate average response time from completed SOS requests
    const { data: completedSOS } = await supabase
      .from('sos_requests')
      .select('created_at, updated_at')
      .eq('status', 'completed')
      .limit(100)

    let avgResponseTime = '4.2 min'
    if (completedSOS && completedSOS.length > 0) {
      const totalResponseTime = completedSOS.reduce((sum, sos) => {
        const created = new Date(sos.created_at)
        const updated = new Date(sos.updated_at)
        const diffMinutes = (updated.getTime() - created.getTime()) / (1000 * 60)
        return sum + diffMinutes
      }, 0)
      const avgMinutes = totalResponseTime / completedSOS.length
      avgResponseTime = `${avgMinutes.toFixed(1)} min`
    }

    // Get recent system alerts (mock for now - would need real monitoring system)
    const systemAlerts = [
      {
        id: 1,
        type: 'info',
        message: 'System running normally',
        timestamp: new Date().toISOString(),
        severity: 'low'
      }
    ]

    // Get users by role distribution
    const { data: usersByRole } = await supabase
      .from('user_records')
      .select('role')

    const roleDistribution = usersByRole?.reduce((acc: Record<string, number>, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1
      return acc
    }, {}) || {}

    // Get recent activity (last 24 hours)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const { count: recentSOS } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString())

    const { count: recentUsers } = await supabase
      .from('user_records')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString())

    const stats = {
      totalUsers: totalUsers || 0,
      totalHospitals: totalHospitals || 0,
      activeEmergencies: activeEmergencies || 0,
      totalDrivers: totalDrivers || 0,
      systemUptime,
      avgResponseTime,
      systemAlerts,
      roleDistribution,
      recentActivity: {
        newSOS: recentSOS || 0,
        newUsers: recentUsers || 0
      }
    }

    return NextResponse.json({
      stats,
      success: true
    })
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch admin dashboard stats',
        success: false 
      },
      { status: 500 }
    )
  }
}
