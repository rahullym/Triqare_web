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
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('dateRange') || '30' // days

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    // Get total cases in date range
    const { count: totalCases } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get critical cases
    const { count: criticalCases } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'critical')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get completed cases
    const { count: completedCases } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Calculate average response time
    const { data: completedSOSWithTimes } = await supabase
      .from('sos_requests')
      .select('created_at, updated_at')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    let avgResponseTime = 0
    if (completedSOSWithTimes && completedSOSWithTimes.length > 0) {
      const totalResponseTime = completedSOSWithTimes.reduce((sum, sos) => {
        const created = new Date(sos.created_at)
        const updated = new Date(sos.updated_at)
        const diffMinutes = (updated.getTime() - created.getTime()) / (1000 * 60)
        return sum + diffMinutes
      }, 0)
      avgResponseTime = totalResponseTime / completedSOSWithTimes.length
    }

    // Get cases by severity for pie chart
    const { data: casesBySeverity } = await supabase
      .from('sos_requests')
      .select('severity')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    const severityDistribution = casesBySeverity?.reduce((acc: Record<string, number>, case_) => {
      acc[case_.severity] = (acc[case_.severity] || 0) + 1
      return acc
    }, {}) || {}

    const severityChartData = Object.entries(severityDistribution).map(([severity, count]) => ({
      name: severity.charAt(0).toUpperCase() + severity.slice(1),
      value: count,
      color: severity === 'critical' ? '#ef4444' : severity === 'high' ? '#f97316' : '#22c55e'
    }))

    // Get cases by status for pie chart
    const { data: casesByStatus } = await supabase
      .from('sos_requests')
      .select('status')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    const statusDistribution = casesByStatus?.reduce((acc: Record<string, number>, case_) => {
      acc[case_.status] = (acc[case_.status] || 0) + 1
      return acc
    }, {}) || {}

    const statusChartData = Object.entries(statusDistribution).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      color: status === 'completed' ? '#22c55e' : status === 'cancelled' ? '#ef4444' : '#3b82f6'
    }))

    // Get daily cases for line chart (last 30 days)
    const dailyCases = []
    for (let i = parseInt(dateRange) - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)

      const { count: dayCount } = await supabase
        .from('sos_requests')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString())

      dailyCases.push({
        date: date.toISOString().split('T')[0],
        cases: dayCount || 0
      })
    }

    // Get monthly trends for bar chart
    const monthlyTrends = []
    for (let i = 5; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)

      const { count: monthCount } = await supabase
        .from('sos_requests')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString())

      monthlyTrends.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        cases: monthCount || 0
      })
    }

    // Get top performing hospitals
    const { data: hospitalPerformance } = await supabase
      .from('sos_requests')
      .select(`
        hospital_id,
        hospitals (
          name
        )
      `)
      .not('hospital_id', 'is', null)
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    const hospitalStats = hospitalPerformance?.reduce((acc: Record<string, any>, sos: any) => {
      const hospitalName = sos.hospitals?.name || 'Unknown Hospital'
      if (!acc[hospitalName]) {
        acc[hospitalName] = { name: hospitalName, cases: 0 }
      }
      acc[hospitalName].cases++
      return acc
    }, {}) || {}

    const topHospitals = Object.values(hospitalStats)
      .sort((a: any, b: any) => b.cases - a.cases)
      .slice(0, 5)

    const analytics = {
      summary: {
        totalCases: totalCases || 0,
        criticalCases: criticalCases || 0,
        completedCases: completedCases || 0,
        avgResponseTime: avgResponseTime.toFixed(1)
      },
      charts: {
        severityDistribution: severityChartData,
        statusDistribution: statusChartData,
        dailyTrends: dailyCases,
        monthlyTrends: monthlyTrends
      },
      insights: {
        topHospitals,
        completionRate: (totalCases || 0) > 0 ? ((completedCases || 0) / (totalCases || 1) * 100).toFixed(1) : '0',
        criticalRate: (totalCases || 0) > 0 ? ((criticalCases || 0) / (totalCases || 1) * 100).toFixed(1) : '0'
      }
    }

    return NextResponse.json({
      analytics,
      success: true
    })
  } catch (error) {
    console.error('Error fetching reports analytics:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch reports analytics',
        success: false 
      },
      { status: 500 }
    )
  }
}
