import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { SOSRequestService } from '@/services/sosRequestService'

// Canonical "completed" SOS state (an SOS reaching the hospital). The live
// sos_requests table has no created_at/updated_at/severity/location/assigned_driver_id
// columns and uses the canonical status enum (see src/lib/sosStatus.ts) — driver is
// denormalized inline on driver_id. PostgREST nested embeds are broken DB-wide, so we
// batch-fetch and merge in JS.
const COMPLETED_STATUS = 'Arrived at Hospital'
const TERMINAL_FILTER = '("Arrived at Hospital","Cancelled")'

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthedUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Reap stale no-driver requests first so "active emergencies" / pending-assignment
    // counts reflect the no-driver timeout instead of counting dead requests. Non-fatal.
    await SOSRequestService.expireStaleRequests().catch((e) =>
      console.warn('SOS timeout sweep failed (non-fatal):', e)
    )

    const supabase = await createClient()

    // Get active emergencies (SOS requests that are not in a terminal state)
    const { count: activeEmergencies } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', TERMINAL_FILTER)

    // Get available ambulances (mock for now - need ambulances table)
    // For now, we'll use a calculation based on drivers.
    const { count: totalDrivers } = await supabase
      .from('drivers')
      .select('*', { count: 'exact', head: true })

    // Busy = any driver not 'available' (assigned / on_trip / inactive).
    const { count: busyDrivers } = await supabase
      .from('drivers')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'available')

    const availableAmbulances = Math.max(0, (totalDrivers || 0) - (busyDrivers || 0))

    // Get on-duty drivers
    const { count: onDutyDrivers } = await supabase
      .from('drivers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available')

    // Calculate average response time from recent completed SOS requests, using the
    // real requested_at / assigned_at timestamps.
    const { data: recentCompletedSOS } = await supabase
      .from('sos_requests')
      .select('requested_at, assigned_at')
      .eq('status', COMPLETED_STATUS)
      .not('assigned_at', 'is', null)
      .order('requested_at', { ascending: false })
      .limit(50)

    let avgResponseTime = '4.2 min'
    if (recentCompletedSOS && recentCompletedSOS.length > 0) {
      const totalResponseTime = recentCompletedSOS.reduce((sum, sos) => {
        const requested = new Date(sos.requested_at)
        const assigned = new Date(sos.assigned_at!)
        const diffMinutes = (assigned.getTime() - requested.getTime()) / (1000 * 60)
        return sum + diffMinutes
      }, 0)
      const avgMinutes = totalResponseTime / recentCompletedSOS.length
      avgResponseTime = `${avgMinutes.toFixed(1)} min`
    }

    // Get completed cases today (by completed_at)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { count: completedToday } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', COMPLETED_STATUS)
      .gte('completed_at', today.toISOString())
      .lt('completed_at', tomorrow.toISOString())

    // Get pending assignments (active SOS requests with no driver assigned inline)
    const { count: pendingAssignments } = await supabase
      .from('sos_requests')
      .select('*', { count: 'exact', head: true })
      .is('driver_id', null)
      .not('status', 'in', TERMINAL_FILTER)

    // Get recent active cases with details (real columns + inline driver). Embeds are
    // broken DB-wide, so batch-fetch the assigned driver's user identity and merge.
    const { data: activeCases } = await supabase
      .from('sos_requests')
      .select('id, patient_name, patient_phone, location_lat, location_lon, status, requested_at, driver_id, driver_name, driver_phone')
      .not('status', 'in', TERMINAL_FILTER)
      .order('requested_at', { ascending: false })
      .limit(10)

    const activeCaseDriverIds = [...new Set((activeCases || []).map(c => c.driver_id).filter(Boolean))]
    const { data: activeCaseDrivers } = activeCaseDriverIds.length > 0
      ? await supabase.from('users').select('id, full_name, phone').in('id', activeCaseDriverIds)
      : { data: [] as any[] }
    const activeCaseDriverById = Object.fromEntries((activeCaseDrivers || []).map((u: any) => [u.id, u]))

    const activeCasesTransformed = (activeCases || []).map((c: any) => ({
      id: c.id,
      patient_name: c.patient_name,
      patient_phone: c.patient_phone,
      latitude: c.location_lat,
      longitude: c.location_lon,
      status: c.status,
      requested_at: c.requested_at,
      driver_id: c.driver_id,
      driver: c.driver_id ? {
        id: c.driver_id,
        name: c.driver_name || activeCaseDriverById[c.driver_id]?.full_name || null,
        phone: c.driver_phone || activeCaseDriverById[c.driver_id]?.phone || null,
      } : null,
    }))

    const stats = {
      activeEmergencies: activeEmergencies || 0,
      availableAmbulances: availableAmbulances || 0,
      onDutyDrivers: onDutyDrivers || 0,
      avgResponseTime,
      completedToday: completedToday || 0,
      pendingAssignments: pendingAssignments || 0,
      // severity/priority is not a column on the live sos_requests table; surface 0
      // rather than 500 on a non-existent column.
      criticalCases: 0,
      highPriorityCases: 0,
      activeCases: activeCasesTransformed,
      totalDrivers: totalDrivers || 0
    }

    return NextResponse.json({
      stats,
      success: true
    })
  } catch (error) {
    console.error('Error fetching ERT dashboard stats:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch ERT dashboard stats',
        success: false
      },
      { status: 500 }
    )
  }
}
