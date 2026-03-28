'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSkeleton } from '@/components/ui/loading-skeleton'
import { DownloadAppButton } from '@/components/DownloadAppButton'
import {
  AlertTriangle,
  Truck,
  MapPin,
  Clock,
  Activity,
  Phone,
  Users,
  CheckCircle,
  XCircle,
  Zap,
  Navigation,
  Timer,
  Wifi,
  WifiOff
} from 'lucide-react'
import { toast } from 'sonner'
import { useSOSRequestsRealtime } from '@/hooks/useSOSRequestsRealtime'
import { useERTDriversRealtime } from '@/hooks/useERTDriversRealtime'
import { SOSRequest } from '@/services/sosService'

interface ERTDashboardStats {
  activeEmergencies: number
  availableAmbulances: number
  onDutyDrivers: number
  avgResponseTime: string
  completedToday: number
  pendingAssignments: number
  criticalCases: number
  highPriorityCases: number
  activeCases: Array<{
    id: string
    patient_name: string
    patient_phone: string
    location: string
    severity: string
    status: string
    created_at: string
    assigned_driver_id: string | null
    drivers?: {
      id: string
      first_name: string
      last_name: string
      phone_number: string
    }
  }>
  totalDrivers: number
}

export default function ERTDashboardPage() {
  const router = useRouter()
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Use realtime hooks for SOS requests and drivers
  const {
    sosRequests,
    loading: sosLoading,
    error: sosError,
    isConnected: sosConnected,
    refetch: refetchSOS
  } = useSOSRequestsRealtime({
    enabled: true,
    playAlertSound: true,
    onInsert: (sos) => {
      toast.error(`🚨 NEW EMERGENCY from ${sos.patient_name || 'Unknown Patient'}!`, {
        duration: 10000,
        action: {
          label: 'View',
          onClick: () => router.push(`/erteam/sos/${sos.id}`)
        }
      })
      setLastUpdated(new Date())
    },
    onUpdate: (sos) => {
      setLastUpdated(new Date())
    }
  })

  const {
    drivers,
    loading: driversLoading,
    error: driversError,
    isConnected: driversConnected
  } = useERTDriversRealtime({
    enabled: true,
    onInsert: () => setLastUpdated(new Date()),
    onUpdate: () => setLastUpdated(new Date())
  })

  // Calculate real-time statistics from the data
  const stats = useMemo(() => {
    if (!sosRequests || !drivers) return null

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Active emergencies (not completed or cancelled)
    const activeEmergencies = sosRequests.filter(sos =>
      sos.status !== 'Arrived at Hospital' && sos.status !== 'Cancelled'
    )

    // Get driver IDs from active SOS requests
    const activeSosDriverIds = new Set<string>()
    activeEmergencies.forEach(sos => {
      if (sos.assigned_driver?.id) {
        activeSosDriverIds.add(sos.assigned_driver.id)
      }
    })

    // Available drivers (not currently assigned to active SOS)
    const availableDrivers = drivers.filter(driver =>
      driver.driver_status === 'available' && !activeSosDriverIds.has(driver.id)
    )

    // On-duty drivers (available or currently on assignment)
    const onDutyDrivers = drivers.filter(driver =>
      driver.driver_status === 'available' || driver.driver_status === 'assigned' || driver.driver_status === 'on_trip'
    )

    // Completed today
    const completedToday = sosRequests.filter(sos => {
      if (sos.status !== 'Arrived at Hospital') return false
      if (!sos.completed_at) return false
      return new Date(sos.completed_at) >= todayStart
    }).length

    // Pending assignments (SOS triggered but no driver assigned)
    const pendingAssignments = sosRequests.filter(sos =>
      sos.status === 'SOS Triggered' && !sos.assigned_driver
    ).length

    // Calculate average response time (from requested to assigned)
    const completedWithTimes = sosRequests.filter(sos =>
      sos.status === 'Arrived at Hospital' && sos.assigned_at && sos.requested_at
    )

    let avgResponseTime = 'N/A'
    if (completedWithTimes.length > 0) {
      const totalMinutes = completedWithTimes.reduce((sum, sos) => {
        const requested = new Date(sos.requested_at).getTime()
        const assigned = new Date(sos.assigned_at!).getTime()
        return sum + (assigned - requested) / 1000 / 60
      }, 0)
      const avgMinutes = Math.round(totalMinutes / completedWithTimes.length)
      avgResponseTime = `${avgMinutes} min`
    }

    // Get active cases with full details
    const activeCases = activeEmergencies.slice(0, 10).map(sos => ({
      id: sos.id,
      patient_name: sos.patient?.full_name || 'Unknown',
      patient_phone: sos.patient?.phone || 'N/A',
      location: sos.patient?.address_line || 'Unknown location',
      severity: 'medium', // Default since we don't have severity in DB
      status: sos.status,
      created_at: sos.requested_at,
      assigned_driver_id: sos.assigned_driver?.id || null,
      drivers: sos.assigned_driver ? {
        id: sos.assigned_driver.id,
        first_name: sos.assigned_driver.full_name.split(' ')[0] || '',
        last_name: sos.assigned_driver.full_name.split(' ').slice(1).join(' ') || '',
        phone_number: sos.assigned_driver.phone || ''
      } : undefined
    }))

    return {
      activeEmergencies: activeEmergencies.length,
      availableAmbulances: availableDrivers.length,
      onDutyDrivers: onDutyDrivers.length,
      avgResponseTime,
      completedToday,
      pendingAssignments,
      criticalCases: 0, // Not available in current schema
      highPriorityCases: 0, // Not available in current schema
      activeCases,
      totalDrivers: drivers.length
    }
  }, [sosRequests, drivers])

  const loading = sosLoading || driversLoading
  const error = sosError || driversError
  const isConnected = sosConnected && driversConnected

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 border-green-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800'
      case 'dispatched': return 'bg-blue-100 text-blue-800'
      case 'en-route': return 'bg-purple-100 text-purple-800'
      case 'maintenance': return 'bg-gray-100 text-gray-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <RoleGuard allowedRoles={['ert']}>
        <div className="p-6 space-y-6">
          <LoadingSkeleton />
        </div>
      </RoleGuard>
    )
  }

  if (error || !stats) {
    return (
      <RoleGuard allowedRoles={['ert']}>
        <div className="p-6 space-y-6">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to Load Dashboard</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => {
              refetchSOS()
              setLastUpdated(new Date())
            }}>
              Try Again
            </Button>
          </div>
        </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['ert']}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              🚨 ERT Command Center
            </h1>
            <p className="text-gray-600 flex items-center gap-2">
              Emergency Response Team operational dashboard
              {isConnected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <Wifi className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <WifiOff className="h-3 w-3 mr-1" />
                  Disconnected
                </Badge>
              )}
              <span className="text-xs text-gray-500">
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <DownloadAppButton />
            <Badge className="bg-blue-100 text-blue-800">
              <Activity className="h-3 w-3 mr-1" />
              Emergency Response Team
            </Badge>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => router.push('/erteam/sos')}
            >
              <Zap className="h-4 w-4 mr-2" />
              Create SOS Alert
            </Button>
          </div>
        </div>

        {/* Critical Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-800">Active Emergencies</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-700">{stats.activeEmergencies}</div>
              <p className="text-xs text-red-600">
                {stats.criticalCases} critical, {stats.highPriorityCases} high priority
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Ambulances</CardTitle>
              <Truck className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.availableAmbulances}</div>
              <p className="text-xs text-muted-foreground">
                Ready for dispatch
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On-Duty Drivers</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.onDutyDrivers}</div>
              <p className="text-xs text-muted-foreground">
                of {stats.totalDrivers} total drivers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
              <Clock className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.avgResponseTime}</div>
              <p className="text-xs text-muted-foreground">
                Recent average
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completedToday}</div>
              <p className="text-xs text-muted-foreground">
                Successfully resolved
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Assignments</CardTitle>
              <Timer className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.pendingAssignments}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting dispatch
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Active Emergencies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Active Emergency Cases ({stats.activeCases.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.activeCases.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>No active emergencies at the moment</p>
                <p className="text-sm">All systems operational</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stats.activeCases.map((emergency) => (
                  <div key={emergency.id} className={`p-4 rounded-lg border-2 ${getPriorityColor(emergency.severity)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline" className="font-mono">
                          SOS-{emergency.id}
                        </Badge>
                        <Badge className={getPriorityColor(emergency.severity)}>
                          {emergency.severity.toUpperCase()}
                        </Badge>
                        <Badge className={getStatusColor(emergency.status)}>
                          {emergency.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(emergency.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Patient</p>
                        <p className="text-gray-900">{emergency.patient_name}</p>
                        <p className="text-sm text-gray-600">{emergency.patient_phone}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Location</p>
                        <p className="text-gray-900 flex items-center">
                          <MapPin className="h-4 w-4 mr-1" />
                          {emergency.location}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Assigned Driver</p>
                        <p className="text-gray-900">
                          {emergency.drivers ?
                            `${emergency.drivers.first_name} ${emergency.drivers.last_name}` :
                            'Not assigned'
                          }
                        </p>
                        {emergency.drivers && (
                          <p className="text-sm text-gray-600">{emergency.drivers.phone_number}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2 mt-3">
                      {!emergency.assigned_driver_id && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                          <Phone className="h-4 w-4 mr-1" />
                          Assign Driver
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/erteam/sos/${emergency.id}`)}
                      >
                        <Activity className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                      <Button size="sm" variant="outline">
                        <MapPin className="h-4 w-4 mr-1" />
                        View on Map
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>



        {/* ERT Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Emergency Response Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="h-20 flex-col bg-red-50 hover:bg-red-100 border-red-200"
                onClick={() => router.push('/erteam/sos')}
              >
                <AlertTriangle className="h-6 w-6 mb-2 text-red-600" />
                Create SOS Alert
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <MapPin className="h-6 w-6 mb-2" />
                Live Map View
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Phone className="h-6 w-6 mb-2" />
                Dispatch Center
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Navigation className="h-6 w-6 mb-2" />
                Route Optimization
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  )
}
