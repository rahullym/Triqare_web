'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  MapPin,
  Truck,
  Building2,
  Navigation,
  Zap,
  Clock,
  Phone,
  Activity,
  Users,
  RefreshCw,
  Loader2
} from 'lucide-react'
import LiveTrackingMap, { MapMarker } from '@/components/maps/LiveTrackingMap'
import { toast } from 'sonner'
import { useERTDriversRealtime } from '@/hooks/useERTDriversRealtime'

interface Hospital {
  id: string
  name: string
  latitude: number
  longitude: number
  status: string
  phone?: string
}

export default function ERTMapPage() {
  const router = useRouter()
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loadingHospitals, setLoadingHospitals] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Use realtime hook for drivers with location tracking
  const { drivers, loading: loadingDrivers, isConnected, refetch } = useERTDriversRealtime({
    enabled: true,
    filters: {},
    onInsert: (driver) => {
      toast.success('New driver added to map')
      setLastUpdated(new Date())
    },
    onUpdate: (driver) => {
      console.log('📍 Driver location updated:', driver)
      setLastUpdated(new Date())
    },
    onDelete: (driverId) => {
      toast.info('Driver removed from map')
      setLastUpdated(new Date())
    }
  })

  // Fetch hospitals
  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        setLoadingHospitals(true)
        const response = await fetch('/api/hospitals?status=active')

        if (!response.ok) {
          console.error('Failed to fetch hospitals:', response.statusText)
          return
        }

        const result = await response.json()

        // API returns { hospitals: [...], count: number }
        if (result.hospitals) {
          console.log('🏥 Hospitals Loaded:', result.count || result.hospitals.length)
          setHospitals(result.hospitals || [])
        } else if (result.error) {
          console.error('❌ Failed to load hospitals:', result.error)
          toast.error('Failed to load hospitals')
        }
      } catch (error) {
        console.error('💥 Error fetching hospitals:', error)
        toast.error('Failed to fetch hospital data')
      } finally {
        setLoadingHospitals(false)
      }
    }

    fetchHospitals()
  }, [])

  // Convert real-time driver data and hospitals to map markers
  const mapMarkers: MapMarker[] = useMemo(() => {
    const markers: MapMarker[] = []

    // Add driver markers from real-time data
    drivers.forEach(driver => {
      if (driver.latitude && driver.longitude) {
        markers.push({
          id: driver.id,
          lat: driver.latitude,
          lng: driver.longitude,
          type: 'driver' as const,
          name: driver.full_name || 'Unknown Driver',
          status: driver.status, // online, busy, offline
          info: driver.transport_company?.company_name
            ? `Company: ${driver.transport_company.company_name}`
            : undefined
        })
      }
    })

    // Add hospital markers
    hospitals.forEach(hospital => {
      if (hospital.latitude && hospital.longitude) {
        markers.push({
          id: hospital.id,
          lat: parseFloat(String(hospital.latitude)),
          lng: parseFloat(String(hospital.longitude)),
          type: 'hospital' as const,
          name: hospital.name,
          status: hospital.status,
          info: hospital.phone ? `Phone: ${hospital.phone}` : undefined
        })
      }
    })

    console.log('🗺️ Map Markers Updated:', {
      total: markers.length,
      drivers: markers.filter(m => m.type === 'driver').length,
      hospitals: markers.filter(m => m.type === 'hospital').length
    })

    return markers
  }, [drivers, hospitals])

  // Summary counts
  const counts = useMemo(() => ({
    drivers: drivers.length,
    online: drivers.filter(d => d.status === 'online').length,
    busy: drivers.filter(d => d.status === 'busy').length,
    hospitals: hospitals.length,
    total: mapMarkers.length
  }), [drivers, hospitals, mapMarkers])

  const loading = loadingDrivers || loadingHospitals

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              🗺️ Live Map View
            </h1>
            <p className="text-gray-600">
              Real-time tracking of drivers and hospitals
            </p>
            {lastUpdated && (
              <p className="text-xs text-gray-400 mt-1">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {/* Real-time Connection Status */}
            <Badge
              className={isConnected
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
              }
            >
              <div className={`h-2 w-2 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {isConnected ? 'Live' : 'Connecting...'}
            </Badge>
            <Badge className="bg-blue-100 text-blue-800">
              <Activity className="h-3 w-3 mr-1" />
              ERT Access
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
            <Button onClick={() => router.push('/erteam/sos')}>
              <Zap className="h-4 w-4 mr-2" />
              Create Emergency
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Drivers</p>
                  <p className="text-2xl font-bold text-green-600">{counts.drivers}</p>
                </div>
                <Truck className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Online</p>
                  <p className="text-2xl font-bold text-blue-600">{counts.online}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Busy</p>
                  <p className="text-2xl font-bold text-orange-600">{counts.busy}</p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Hospitals</p>
                  <p className="text-2xl font-bold text-red-600">{counts.hospitals}</p>
                </div>
                <Building2 className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Area */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Live Tracking Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full h-[500px] bg-gray-100 rounded-lg flex items-center justify-center">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      <span className="text-gray-600">Loading map data...</span>
                    </div>
                  </div>
                ) : (
                  <LiveTrackingMap
                    markers={mapMarkers}
                    className="h-[500px]"
                    onMarkerClick={(marker) => {
                      toast.info(`Selected: ${marker.name} (${marker.type})`)
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Online Drivers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-green-500" />
                  Online Drivers ({counts.online})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {drivers.filter(d => d.status === 'online').length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No online drivers</p>
                  ) : (
                    drivers.filter(d => d.status === 'online').map((driver) => (
                      <div key={driver.id} className="p-3 border rounded-lg bg-green-50 border-green-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{driver.full_name}</span>
                          <Badge className="bg-green-100 text-green-800">
                            Online
                          </Badge>
                        </div>
                        {driver.transport_company?.company_name && (
                          <div className="text-xs text-gray-600 mb-1">
                            🏢 {driver.transport_company.company_name}
                          </div>
                        )}
                        {driver.latitude && driver.longitude && (
                          <div className="text-xs text-gray-400">
                            📍 {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Busy Drivers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-orange-500" />
                  Busy Drivers ({counts.busy})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {drivers.filter(d => d.status === 'busy').length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No busy drivers</p>
                  ) : (
                    drivers.filter(d => d.status === 'busy').map((driver) => (
                      <div key={driver.id} className="p-3 border rounded-lg bg-orange-50 border-orange-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{driver.full_name}</span>
                          <Badge className="bg-orange-100 text-orange-800">
                            Busy
                          </Badge>
                        </div>
                        {driver.transport_company?.company_name && (
                          <div className="text-xs text-gray-600 mb-1">
                            🏢 {driver.transport_company.company_name}
                          </div>
                        )}
                        {driver.latitude && driver.longitude && (
                          <div className="text-xs text-gray-400">
                            📍 {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Hospitals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-red-500" />
                  Hospitals ({counts.hospitals})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {hospitals.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No hospitals with location data</p>
                  ) : (
                    hospitals.map((hospital) => (
                      <div key={hospital.id} className="p-3 border rounded-lg">
                        <div className="font-medium text-sm mb-1">{hospital.name}</div>
                        {hospital.phone && (
                          <div className="text-xs text-gray-600 mb-1">
                            <Phone className="h-3 w-3 inline mr-1" />
                            {hospital.phone}
                          </div>
                        )}
                        <div className="text-xs text-gray-400">
                          📍 {parseFloat(String(hospital.latitude)).toFixed(4)}, {parseFloat(String(hospital.longitude)).toFixed(4)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions */}
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
                <Zap className="h-6 w-6 mb-2 text-red-600" />
                Create Emergency
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Truck className="h-6 w-6 mb-2" />
                Dispatch Ambulance
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Navigation className="h-6 w-6 mb-2" />
                Route Optimization
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Phone className="h-6 w-6 mb-2" />
                Emergency Contacts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
  )
}
