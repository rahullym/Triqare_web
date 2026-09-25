'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DownloadAppButton } from '@/components/DownloadAppButton'
import {
  Car,
  Users,
  Activity,
  Clock,
  MapPin,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Calendar,
  Star,
  UserPlus,
  Building2,
  Loader2,
  Plus,
  Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  describePresence,
  getDriverPresence,
  PRESENCE_BADGE_CLASS,
  summarisePresence,
} from '@/lib/driverPresence'
import Link from 'next/link'

// Fallback refresh cadence while the tab is visible; Realtime normally wins.
const LIVE_POLL_MS = 15_000

interface Driver {
  user_id: string
  transport_company_id: string
  license_number: string
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  current_request_id?: string | null
  last_updated_at?: string | null
  is_verified: boolean
  user?: {
    id: string
    full_name: string
    email: string
    role: string
    created_at: string
  }
  transport_company?: {
    user_id: string
    company_name: string
    registration_number?: string
    is_verified: boolean
  }
}

interface SOSRequest {
  id: string
  patient_name: string
  patient_email: string
  patient_phone: string
  assigned_driver?: {
    id: string
    name: string
    email: string
    phone: string
  } | null
  requested_at: string
  assigned_at?: string | null
  completed_at?: string | null
  status: string
}

interface TransportCompany {
  user_id: string
  company_name: string
  address_line?: string
  registration_number?: string
  license_valid_till?: string
  is_verified: boolean
  user?: {
    id: string
    full_name: string
    email: string
    role: string
    created_at: string
  }
}

interface TransportDashboardStats {
  totalDrivers: number
  // The same four duty states Admin shows, scoped to this company's fleet, so
  // the two dashboards reconcile. See src/lib/driverPresence.ts.
  dispatchableDrivers: number
  onDutyDrivers: number
  onTripDrivers: number
  needsAttentionDrivers: number
  offDutyDrivers: number
  liveGpsDrivers: number
  noDeviceDrivers: number
  uncheckedDrivers: number
  needsAttentionDriverIds: string[]
  staleTripDriverIds: string[]
  availableDrivers: number
  busyDrivers: number
  offlineDrivers: number
  activeAssignments: number
  completedToday: number
  completedThisMonth: number
  avgResponseTime: string
  recentActivity: Array<{
    id: string
    driver_name: string
    action: string
    timestamp: string
  }>
  performanceMetrics: {
    successRate: string
    customerRating: string
  }
}

export default function TransportDashboardPage() {
  const [stats, setStats] = useState<TransportDashboardStats | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [sosRequests, setSOSRequests] = useState<SOSRequest[]>([])
  const [company, setCompany] = useState<TransportCompany | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const fetchDashboardData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      // A realtime-driven refresh must not blank the page out behind the loading
      // spinner — it repaints in place instead.
      if (!silent) setIsLoading(true)
      setError(null)

      // These four endpoints do not depend on each other, but they used to be
      // awaited one after another — and every serverless request pays for a
      // Supabase session check in middleware plus another in the route handler
      // before it touches a table, so the page waited on four round trips'
      // worth of auth it could have overlapped.
      const [statsResponse, companyResponse, driversResponse, sosResponse] = await Promise.all([
        fetch('/api/transport/dashboard/stats'),
        fetch('/api/transport/company'),
        fetch('/api/transport/drivers?limit=10'),
        fetch('/api/transport/sos-requests?limit=10'),
      ])

      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        if (statsData.success) {
          setStats(statsData.stats)
        }
      }

      if (companyResponse.ok) {
        const companyData = await companyResponse.json()
        if (companyData.success) {
          setCompany(companyData.company)
        }
      }

      if (driversResponse.ok) {
        const driversData = await driversResponse.json()
        if (driversData.success) {
          setDrivers(driversData.drivers || [])
        }
      }

      if (sosResponse.ok) {
        const sosData = await sosResponse.json()
        if (sosData.success) {
          setSOSRequests(sosData.requests || [])
        }
      }

      setLastUpdatedAt(new Date())
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      // A background refresh that fails leaves the last good numbers on screen
      // rather than replacing the whole dashboard with an error card.
      if (!silent) {
        setError('Failed to load dashboard data')
        toast.error('Failed to load dashboard data')
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // Always-current refresher for the realtime handlers (avoids stale closures).
  const refreshRef = useRef<() => void>(() => {})
  refreshRef.current = () => fetchDashboardData({ silent: true })

  // Live updates: a driver going online, an SOS being raised, a status moving to
  // the next stage — all repaint the tiles without a page refresh. Debounced so a
  // burst of writes (assignment + status + location in one second) is one refetch.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refreshRef.current(), 800)
    }
    const channel = supabase
      .channel('transport-company-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_requests' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_request_assigned' }, bump)
      .subscribe()
    // Realtime alone is not enough: a driver signing into the app changes
    // device_tokens, which anon cannot read so no event ever arrives, and a table
    // missing from the supabase_realtime publication is silent (see
    // migrations/99_updates/transport_realtime_publication.sql). Poll while the
    // tab is visible and refresh as soon as it becomes visible again.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current()
    }, LIVE_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [])

  // Use stats from API or fallback to calculated values
  const availableDrivers = stats?.availableDrivers || drivers.filter(d => d.status === 'available').length
  // Fall back to the loaded driver page when the stats call has not landed yet.
  const presenceFallback = summarisePresence(
    drivers.map((d) => ({
      status: d.status,
      lastUpdatedAt: d.last_updated_at,
      currentRequestId: d.current_request_id,
    })),
  )
  const liveGpsDrivers = stats?.liveGpsDrivers ?? presenceFallback.liveGps
  const dispatchableDrivers = stats?.dispatchableDrivers ?? presenceFallback.dispatchable
  const needsAttentionDrivers = stats?.needsAttentionDrivers ?? 0
  const noDeviceDrivers = stats?.noDeviceDrivers ?? 0
  const uncheckedDrivers = stats?.uncheckedDrivers ?? 0
  // Only the stats route reads device_tokens, so the client cannot re-derive
  // reachability on its own — it badges the IDs the route reports.
  const needsAttentionDriverIds = useMemo(
    () => new Set(stats?.needsAttentionDriverIds ?? []),
    [stats?.needsAttentionDriverIds],
  )
  // Drivers still pinned to a request that is already over. Only the stats route
  // can check that (it reads sos_requests), so the client badges what it reports.
  const staleTripDriverIds = useMemo(
    () => new Set(stats?.staleTripDriverIds ?? []),
    [stats?.staleTripDriverIds],
  )
  const onTripDrivers = stats?.busyDrivers || drivers.filter(d => d.status === 'on_trip' || d.status === 'assigned').length
  const activeCases = stats?.activeAssignments || sosRequests.filter(r => r.status === 'driver_assigned' || r.status === 'in_progress').length
  const completedToday = stats?.completedToday || sosRequests.filter(r => {
    if (r.status !== 'completed' || !r.completed_at) return false
    const today = new Date().toDateString()
    const completedDate = new Date(r.completed_at).toDateString()
    return today === completedDate
  }).length

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available': return 'Available'
      case 'assigned': return 'Assigned'
      case 'on_trip': return 'On Trip'
      case 'inactive': return 'Inactive'
      default: return status
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={['transport_company']}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">Loading dashboard...</p>
            </div>
          </div>
        </div>
      </RoleGuard>
    )
  }

  if (error) {
    return (
      <RoleGuard allowedRoles={['transport_company']}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-600" />
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={() => fetchDashboardData()}>
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </RoleGuard>
    )
  }



  return (
    <RoleGuard allowedRoles={['transport_company']}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              🚛 Transport Dashboard
            </h1>
            <p className="text-gray-600">
              {company?.company_name || 'Transport Company'} - Driver operations and transport management overview
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500" title="This dashboard updates itself as drivers and SOS cases change — no refresh needed">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Live
              {lastUpdatedAt && (
                <span className="text-gray-400">
                  · {lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </span>
            <DownloadAppButton />
            <Badge className="bg-green-100 text-green-800">
              <Building2 className="h-3 w-3 mr-1" />
              {company?.is_verified ? 'Verified Company' : 'Pending Verification'}
            </Badge>
            <Button asChild>
              <Link href="/transport/drivers/add">
                <Plus className="h-4 w-4 mr-2" />
                Add Driver
              </Link>
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Drivers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalDrivers || drivers.length}</div>
              <p className="text-xs text-muted-foreground">
                Registered drivers
              </p>
            </CardContent>
          </Card>

          {/* "Available" is a flag the driver sets once and it survives a
              force-quit, so it answered "who declared themselves on duty", never
              "who is reachable now". This counts the drivers dispatch would
              actually page. It deliberately does NOT lead with live GPS: that
              heartbeat is foreground-only, so it reads 0 for every driver who has
              pocketed their phone — which is all of them, all the time. */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On Duty Now</CardTitle>
              <Wifi className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{dispatchableDrivers}</div>
              <p className="text-xs text-muted-foreground">
                Reachable by dispatch
                {liveGpsDrivers > 0 ? ` · ${liveGpsDrivers} sending live GPS` : ''}
              </p>
              {needsAttentionDrivers > 0 && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {needsAttentionDrivers} need attention
                  {noDeviceDrivers > 0 && ` · ${noDeviceDrivers} with no device`}
                  {uncheckedDrivers > 0 && ` · ${uncheckedDrivers} unchecked`}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Drivers</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{availableDrivers}</div>
              <p className="text-xs text-muted-foreground">
                Marked on duty
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On Trip</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{onTripDrivers}</div>
              <p className="text-xs text-muted-foreground">
                Currently assigned
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{activeCases}</div>
              <p className="text-xs text-muted-foreground">
                In progress
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedToday}</div>
              <p className="text-xs text-muted-foreground">
                Successfully completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Calendar className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.completedThisMonth || 0}</div>
              <p className="text-xs text-muted-foreground">
                Monthly completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.avgResponseTime || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">
                Average response
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.performanceMetrics.successRate || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">
                Completion rate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Drivers and SOS Requests */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My Drivers */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  My Drivers ({drivers.length})
                </CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/transport/drivers">
                    View All
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {drivers.slice(0, 5).map((driver) => (
                  <div key={driver.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">{driver.user?.full_name || 'Unknown Driver'}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {driver.user?.email || 'No email'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            {driver.license_number}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {(() => {
                        const p = getDriverPresence({
                          status: driver.status,
                          lastUpdatedAt: driver.last_updated_at,
                          currentRequestId: driver.current_request_id,
                          currentRequestIsActive: staleTripDriverIds.has(driver.user_id)
                            ? false
                            : undefined,
                          hasPushToken: needsAttentionDriverIds.has(driver.user_id)
                            ? false
                            : undefined,
                        })
                        return (
                          <Badge
                            className={PRESENCE_BADGE_CLASS[p.presence]}
                            title={`${describePresence(p)} (raw status: ${getStatusLabel(driver.status)})`}
                          >
                            <span className="mr-1">●</span>
                            {p.label}
                          </Badge>
                        )
                      })()}
                      {driver.is_verified && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </div>
                ))}
                {drivers.length === 0 && (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No drivers yet</h3>
                    <p className="text-gray-600 mb-4">Add your first driver to get started</p>
                    <Button asChild>
                      <Link href="/transport/drivers/add">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Driver
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent SOS Cases */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent SOS Cases ({sosRequests.length})
                </CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/transport/sos-requests">
                    View All
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sosRequests.slice(0, 5).map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">{request.patient_name}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {request.assigned_driver?.name || 'Unassigned'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(request.requested_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={
                        request.status === 'completed' ? 'bg-green-100 text-green-800' :
                        request.status === 'driver_assigned' ? 'bg-blue-100 text-blue-800' :
                        request.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }>
                        {request.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
                {sosRequests.length === 0 && (
                  <div className="text-center py-8">
                    <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No SOS cases</h3>
                    <p className="text-gray-600">Your drivers haven't been assigned to any SOS cases yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </RoleGuard>
  )
}
