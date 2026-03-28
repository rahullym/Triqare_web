'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Search,
  UserCheck,
  Clock,
  MapPin,
  Phone,
  Activity,
  CheckCircle,
  AlertTriangle,
  Eye,
  Edit,
  User,
  Truck,
  Loader2,
  RefreshCw,
  Building,
  Mail,
  X,
  LayoutGrid,
  List
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useERTStatusColor,
  useERTShiftColor,
  formatCertifications,
  calculateHoursWorked,
  getShiftTimes,
  formatDriverLocation,
  getDriverCompany,
  type ERTDriverFilters
} from '@/hooks/useERTDrivers'
import { useERTDriversRealtime } from '@/hooks/useERTDriversRealtime'
import { LocationService, type DatabaseCountry, type DatabaseState, type DatabaseCity } from '@/services/locationService'
import { toast } from 'sonner'

export default function DriversPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<ERTDriverFilters['status']>('all')
  const [shiftFilter, setShiftFilter] = useState<ERTDriverFilters['shift']>('all')
  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Location data
  const [countries, setCountries] = useState<DatabaseCountry[]>([])
  const [states, setStates] = useState<DatabaseState[]>([])
  const [cities, setCities] = useState<DatabaseCity[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)

  // Memoize filters to prevent unnecessary re-subscriptions
  const realtimeFilters = useMemo(() => ({
    search: searchTerm,
    status: statusFilter,
    shift: shiftFilter,
    country_id: countryFilter === 'all' ? undefined : countryFilter,
    state_id: stateFilter === 'all' ? undefined : stateFilter,
    city_id: cityFilter === 'all' ? undefined : cityFilter
  }), [searchTerm, statusFilter, shiftFilter, countryFilter, stateFilter, cityFilter])

  // Use the realtime hook to fetch drivers with status
  const { drivers, loading, error, stats, refetch, isConnected } = useERTDriversRealtime({
    enabled: true,
    filters: realtimeFilters,
    onInsert: (driver) => {
      toast.success('New driver added to the system')
    },
    onUpdate: (driver) => {
      toast.info('Driver status updated')
    },
    onDelete: (driverId) => {
      toast.info('Driver removed from the system')
    }
  })

  // Load countries on component mount
  useEffect(() => {
    const loadCountries = async () => {
      setLoadingLocations(true)
      const { data, error } = await LocationService.getCountries()
      if (error) {
        console.error('Failed to load countries:', error)
      } else {
        setCountries(data || [])
      }
      setLoadingLocations(false)
    }
    loadCountries()
  }, [])

  // Load states when country changes
  useEffect(() => {
    const loadStates = async () => {
      if (!countryFilter || countryFilter === 'all') {
        setStates([])
        return
      }
      setLoadingLocations(true)
      const { data, error } = await LocationService.getStatesByCountry(countryFilter)
      if (error) {
        console.error('Failed to load states:', error)
      } else {
        setStates(data || [])
      }
      setLoadingLocations(false)
    }
    loadStates()
    // Reset state and city when country changes
    setStateFilter('all')
    setCityFilter('all')
  }, [countryFilter])

  // Load cities when state changes
  useEffect(() => {
    const loadCities = async () => {
      if (!stateFilter || stateFilter === 'all') {
        setCities([])
        return
      }
      setLoadingLocations(true)
      const { data, error } = await LocationService.getCitiesByState(stateFilter)
      if (error) {
        console.error('Failed to load cities:', error)
      } else {
        setCities(data || [])
      }
      setLoadingLocations(false)
    }
    loadCities()
    // Reset city when state changes
    setCityFilter('all')
  }, [stateFilter])

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setShiftFilter('all')
    setCountryFilter('all')
    setStateFilter('all')
    setCityFilter('all')
  }

  // Convert location data to ComboboxOption format
  const countryOptions: ComboboxOption[] = [
    { value: 'all', label: 'All Countries' },
    ...countries.map(country => ({
      value: country.id,
      label: country.name,
      searchText: country.name
    }))
  ]

  const stateOptions: ComboboxOption[] = [
    { value: 'all', label: 'All States' },
    ...states.map(state => ({
      value: state.id,
      label: state.name,
      searchText: state.name
    }))
  ]

  const cityOptions: ComboboxOption[] = [
    { value: 'all', label: 'All Cities' },
    ...cities.map(city => ({
      value: city.id,
      label: city.name,
      searchText: city.name
    }))
  ]

  // Status and shift options
  const statusOptions: ComboboxOption[] = [
    { value: 'all', label: 'All Status' },
    { value: 'online', label: 'Online' },
    { value: 'busy', label: 'Busy (SOS)' },
    { value: 'offline', label: 'Offline' }
  ]

  const shiftOptions: ComboboxOption[] = [
    { value: 'all', label: 'All Shifts' },
    { value: 'day', label: 'Day Shift' },
    { value: 'night', label: 'Night Shift' },
    { value: 'rotating', label: 'Rotating' }
  ]

  // Navigation handlers
  const handleViewDriver = (driverId: string) => {
    router.push(`/admin/drivers/${driverId}`)
  }

  const handleEditDriver = (driverId: string) => {
    router.push(`/admin/drivers/${driverId}/edit`)
  }

  // Helper functions for styling
  const getStatusColor = useERTStatusColor
  const getShiftColor = useERTShiftColor

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-4 w-4" />
      case 'busy':
        return <AlertTriangle className="h-4 w-4" />
      case 'offline':
        return <User className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <UserCheck className="h-6 w-6 mr-2" />
            Driver Status
          </h1>
          <p className="text-gray-600">Monitor driver availability, shifts, and performance</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          <span className="ml-2 text-gray-600">Loading drivers...</span>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <UserCheck className="h-6 w-6 mr-2" />
            Driver Status
          </h1>
          <p className="text-gray-600">Monitor driver availability, shifts, and performance</p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-red-500">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Error Loading Drivers</h3>
              <p className="mb-4">{error}</p>
              <Button onClick={refetch} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <UserCheck className="h-6 w-6 mr-2" />
                Driver Status
              </h1>
              {/* Realtime Connection Status */}
              {isConnected && (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                  Live
                </Badge>
              )}
              {!isConnected && !loading && (
                <Badge variant="secondary" className="bg-red-100 text-red-600">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-2" />
                  Offline
                </Badge>
              )}
            </div>
            <p className="text-gray-600">Monitor driver availability, shifts, and performance</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center border rounded-lg overflow-hidden">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-none"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={refetch} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Online</p>
                  <p className="text-2xl font-bold text-green-600">{stats.online}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Busy (SOS)</p>
                  <p className="text-2xl font-bold text-red-600">{stats.busy}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Offline</p>
                  <p className="text-2xl font-bold text-gray-600">{stats.offline}</p>
                </div>
                <User className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Rating</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.avgRating.toFixed(1)}</p>
                </div>
                <Activity className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search by name, employee ID, or location..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Combobox
                  options={statusOptions}
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as ERTDriverFilters['status'])}
                  placeholder="Select Status"
                  searchPlaceholder="Search status..."
                  emptyText="No status found."
                  className="w-40"
                />
                <Combobox
                  options={shiftOptions}
                  value={shiftFilter}
                  onValueChange={(value) => setShiftFilter(value as ERTDriverFilters['shift'])}
                  placeholder="Select Shift"
                  searchPlaceholder="Search shifts..."
                  emptyText="No shifts found."
                  className="w-40"
                />
                <Combobox
                  options={countryOptions}
                  value={countryFilter}
                  onValueChange={setCountryFilter}
                  placeholder="Select Country"
                  searchPlaceholder="Search countries..."
                  emptyText="No countries found."
                  className="w-40"
                  disabled={loadingLocations}
                />
                <Combobox
                  options={stateOptions}
                  value={stateFilter}
                  onValueChange={setStateFilter}
                  placeholder="Select State"
                  searchPlaceholder="Search states..."
                  emptyText="No states found."
                  className="w-40"
                  disabled={!countryFilter || countryFilter === 'all' || loadingLocations}
                />
                <Combobox
                  options={cityOptions}
                  value={cityFilter}
                  onValueChange={setCityFilter}
                  placeholder="Select City"
                  searchPlaceholder="Search cities..."
                  emptyText="No cities found."
                  className="w-40"
                  disabled={!stateFilter || stateFilter === 'all' || loadingLocations}
                />
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear Filters
                </Button>
              </div>
              {/* Active Filters Summary */}
              {(searchTerm || statusFilter !== 'all' || shiftFilter !== 'all' || countryFilter !== 'all' || stateFilter !== 'all' || cityFilter !== 'all') && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <span className="text-sm text-gray-600">Active filters:</span>
                  {searchTerm && (
                    <Badge variant="secondary" className="text-xs">
                      Search: {searchTerm}
                    </Badge>
                  )}
                  {statusFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      Status: {statusFilter}
                    </Badge>
                  )}
                  {shiftFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      Shift: {shiftFilter}
                    </Badge>
                  )}
                  {countryFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      Country: {countries.find(c => c.id === countryFilter)?.name}
                    </Badge>
                  )}
                  {stateFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      State: {states.find(s => s.id === stateFilter)?.name}
                    </Badge>
                  )}
                  {cityFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      City: {cities.find(c => c.id === cityFilter)?.name}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Drivers Display - Grid or List View */}
        {viewMode === 'grid' ? (
          // Grid View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {drivers.map((driver) => {
              const hoursWorked = calculateHoursWorked(driver.last_updated_at)
              const driverLocation = formatDriverLocation(driver)
              const companyName = getDriverCompany(driver)

              return (
                <Card key={driver.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <UserCheck className="h-5 w-5 text-gray-600" />
                          <div>
                            <h3 className="font-semibold text-gray-900">{driver.full_name}</h3>
                            <p className="text-sm text-gray-500">{driver.employee_id || `ID: ${driver.id.slice(0, 8)}`}</p>
                          </div>
                        </div>
                        <div className="flex flex-col space-y-1">
                          <Badge className={getStatusColor(driver.status)}>
                            {getStatusIcon(driver.status)}
                            <span className="ml-1 capitalize">{driver.status}</span>
                          </Badge>
                          <Badge className={getShiftColor(driver.driver_status)} variant="secondary">
                            {driver.driver_status}
                          </Badge>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="h-4 w-4 mr-2" />
                          {driver.phone || 'No phone number'}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="h-4 w-4 mr-2" />
                          {driver.email}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Building className="h-4 w-4 mr-2" />
                          {companyName}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="h-4 w-4 mr-2" />
                          Last updated: {hoursWorked}h ago
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2" />
                          License: {driver.license_number}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="h-4 w-4 mr-2" />
                          {driverLocation}
                        </div>
                      </div>

                      {/* Assignment Info */}
                      {(driver.current_assignment || driver.current_request_id) && (
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-sm font-medium text-red-800">Current Assignment</p>
                          {driver.current_assignment ? (
                            <>
                              <p className="text-sm text-red-600">
                                SOS Case: {driver.current_assignment.id.slice(0, 8)}...
                              </p>
                              <p className="text-xs text-red-500">
                                Status: {driver.current_assignment.status}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-red-600">
                              Request ID: {driver.current_request_id}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Status Info */}
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                          <p className="text-lg font-semibold text-gray-900">
                            {driver.is_verified ? 'Verified' : 'Pending'}
                          </p>
                          <p className="text-xs text-gray-500">Verification</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-gray-900">
                            {driver.driver_status}
                          </p>
                          <p className="text-xs text-gray-500">Driver Status</p>
                        </div>
                      </div>

                      {/* Location Info */}
                      {(driver.latitude && driver.longitude) && (
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-2">Current Location</p>
                          <div className="text-sm text-gray-600">
                            <p>Lat: {driver.latitude.toFixed(4)}, Lng: {driver.longitude.toFixed(4)}</p>
                          </div>
                        </div>
                      )}

                      {/* Last Updated */}
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Last Updated:</span> {new Date(driver.last_updated_at).toLocaleString()}
                      </div>

                      {/* Actions */}
                      <div className="flex justify-between pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          title="View Details"
                          onClick={() => handleViewDriver(driver.user_id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Call Driver"
                          disabled={!driver.phone}
                          onClick={() => driver.phone && window.open(`tel:${driver.phone}`)}
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Edit Driver"
                          onClick={() => handleEditDriver(driver.user_id)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          // List View
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>License</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map((driver) => {
                    const hoursWorked = calculateHoursWorked(driver.last_updated_at)
                    const driverLocation = formatDriverLocation(driver)
                    const companyName = getDriverCompany(driver)

                    return (
                      <TableRow key={driver.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-gray-500" />
                            <div>
                              <p className="font-medium">{driver.full_name}</p>
                              <p className="text-xs text-gray-500">{driver.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={`${getStatusColor(driver.status)} w-fit`}>
                              {getStatusIcon(driver.status)}
                              <span className="ml-1 capitalize">{driver.status}</span>
                            </Badge>
                            <Badge className={getShiftColor(driver.driver_status)} variant="secondary">
                              {driver.driver_status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Building className="h-3 w-3 text-gray-400" />
                            <span className="text-sm">{companyName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{driver.phone || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{driver.license_number || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            <span className="text-sm max-w-[150px] truncate" title={driverLocation}>
                              {driverLocation}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-500">{hoursWorked}h ago</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View Details"
                              onClick={() => handleViewDriver(driver.user_id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Call Driver"
                              disabled={!driver.phone}
                              onClick={() => driver.phone && window.open(`tel:${driver.phone}`)}
                            >
                              <Phone className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit Driver"
                              onClick={() => handleEditDriver(driver.user_id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {drivers.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-gray-500">
                <UserCheck className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No drivers found</h3>
                <p>Try adjusting your search criteria or filters.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  )
}
