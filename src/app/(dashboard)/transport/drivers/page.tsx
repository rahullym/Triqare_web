'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Users,
  UserPlus,
  Search,
  MapPin,
  Phone,
  Car,
  Mail,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Plus,
  FileText,
  Navigation,
  Clock,
  Edit,
  Trash2,
  MoreVertical,
  FileSpreadsheet,
  Upload,
  Download,
  XCircle,
  History,
  ClipboardList,
  Power,
  Ban
} from 'lucide-react'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { TripHistoryDialog } from '@/components/transport/TripHistoryDialog'
import { SosLogDialog } from '@/components/transport/SosLogDialog'
import {
  deriveDriverStatus,
  DRIVER_STATUS_LABEL,
  type DriverLiveStatus,
  type DriverDashboardStats,
} from '@/lib/transport/driverDashboard'

const LIVE_STATUS_STYLE: Record<DriverLiveStatus, string> = {
  on_trip: 'bg-blue-100 text-blue-800',
  online: 'bg-green-100 text-green-800',
  offline: 'bg-gray-100 text-gray-700',
  unavailable: 'bg-amber-100 text-amber-800',
}

interface Driver {
  user_id: string
  transport_company_id: string
  license_number: string
  aadhar_number?: string | null
  is_verified: boolean
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  current_request_id?: string | null
  latitude?: number | null
  longitude?: number | null
  last_updated_at: string
  country_id?: string | null
  state_id?: string | null
  city_id?: string | null
  pincode_id?: string | null
  address_line?: string | null
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
  country?: { id: string; name: string } | null
  state?: { id: string; name: string } | null
  city?: { id: string; name: string } | null
  pincode?: { id: string; code: string } | null
}

export default function TransportDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // CSV Import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Transport Dashboard Enhancement state
  const [stats, setStats] = useState<Record<string, DriverDashboardStats>>({})
  const [tripDriver, setTripDriver] = useState<Driver | null>(null)
  const [sosDriver, setSosDriver] = useState<Driver | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/transport/drivers/stats')
      if (!res.ok) return
      const data = (await res.json()) as { byId: Record<string, DriverDashboardStats> }
      setStats(data.byId || {})
    } catch {
      /* non-fatal — row metrics just stay at last-known values */
    }
  }, [])

  useEffect(() => {
    fetchDrivers()
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Always-current refresher for realtime handlers (avoids stale closures / re-subscribes).
  const refreshRef = useRef<() => void>(() => {})
  refreshRef.current = () => {
    fetchDrivers({ silent: true })
    fetchStats()
  }

  // Live updates: re-pull drivers + per-row counts when drivers, SOS requests, or
  // the assignment log change — no page refresh. Debounced to coalesce bursts.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refreshRef.current(), 800)
    }
    const channel = supabase
      .channel('transport-driver-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_requests' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_request_assigned' }, bump)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggleStatus = async (driver: Driver) => {
    const action = driver.status === 'inactive' ? 'activate' : 'deactivate'
    setTogglingId(driver.user_id)
    try {
      const res = await fetch(`/api/transport/drivers/${driver.user_id}/toggle-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'activate' ? 'Driver activated' : 'Driver deactivated')
      fetchDrivers({ silent: true })
      fetchStats()
    } catch {
      toast.error('Failed to update driver status')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDeleteDriver = (driver: Driver) => {
    setDriverToDelete(driver)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteDriver = async () => {
    if (!driverToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/transport/drivers/${driverToDelete.user_id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast.success('Driver deleted successfully!')
          // Remove the driver from the list
          setDrivers(prev => prev.filter(d => d.user_id !== driverToDelete.user_id))
        } else {
          throw new Error(data.error || 'Failed to delete driver')
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete driver')
      }
    } catch (error) {
      console.error('Error deleting driver:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete driver')
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setDriverToDelete(null)
    }
  }

  // CSV Import handlers
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast.error('Please select a CSV file')
        return
      }
      setCsvFile(file)
      setCsvResult(null)
    }
  }

  const handleCsvUpload = async () => {
    if (!csvFile) return

    setCsvUploading(true)
    setCsvResult(null)

    try {
      const formData = new FormData()
      formData.append('file', csvFile)

      const response = await fetch('/api/transport/drivers/upload-csv', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (response.ok) {
        setCsvResult({ success: result.success, failed: result.failed, errors: result.errors || [] })
        if (result.success > 0) {
          toast.success(`Successfully added ${result.success} drivers`)
          fetchDrivers()
        }
        if (result.failed > 0) {
          toast.warning(`${result.failed} records failed to import`)
        }
      } else {
        toast.error(result.error || 'Upload failed')
        setCsvResult({ success: 0, failed: 0, errors: [result.error] })
      }
    } catch (error) {
      toast.error('Failed to upload CSV')
      setCsvResult({ success: 0, failed: 0, errors: ['Network error'] })
    } finally {
      setCsvUploading(false)
    }
  }

  const handleCsvDialogClose = () => {
    setCsvDialogOpen(false)
    setCsvFile(null)
    setCsvResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadTemplate = () => {
    const headers = 'full_name,email,phone,license_number,aadhar_number,status,latitude,longitude,address_line,country_name,state_name,city_name,pincode'
    const sampleRow = 'John Driver,john.driver@example.com,9876543210,DL-1234567890,123456789012,available,9.9312,76.2673,"123 Main Street",India,Kerala,Kochi,682001'
    const csv = headers + '\n' + sampleRow

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'drivers_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const fetchDrivers = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      params.append('limit', '100')

      const response = await fetch(`/api/transport/drivers?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDrivers(data.drivers || [])
          // Show info message if no drivers found
          if (!data.drivers || data.drivers.length === 0) {
            if (data.message) {
              console.info(data.message)
            }
          }
        } else {
          throw new Error(data.error || 'Failed to fetch drivers')
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Server error: ${response.status}`)
      }
    } catch (error) {
      console.error('Error fetching drivers:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch drivers')
      toast.error(error instanceof Error ? error.message : 'Failed to fetch drivers')
    } finally {
      setIsLoading(false)
    }
  }

  // Filter drivers based on search and status
  const filteredDrivers = drivers.filter(driver => {
    const matchesSearch = !searchTerm ||
      driver.user?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.license_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.aadhar_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.address_line?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.city?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.state?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.pincode?.code?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || driver.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800'
      case 'assigned':
      case 'on_trip': return 'bg-blue-100 text-blue-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

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
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchDrivers()
  }

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status)
  }

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={['transport_company']}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">Loading drivers...</p>
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
              <Button onClick={() => fetchDrivers()}>
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
              🚛 Driver Management
            </h1>
            <p className="text-gray-600">
              Manage your drivers and monitor their performance
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-blue-100 text-blue-800">
              <Users className="h-3 w-3 mr-1" />
              {filteredDrivers.length} of {drivers.length} Drivers
            </Badge>
            <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button asChild>
              <Link href="/transport/drivers/add">
                <UserPlus className="h-4 w-4 mr-2" />
                Add New Driver
              </Link>
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <Input
                    placeholder="Search drivers by name, email, license, location..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" variant="outline">
                    <Search className="h-4 w-4" />
                  </Button>
                </form>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusFilter('all')}
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === 'available' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusFilter('available')}
                >
                  Available
                </Button>
                <Button
                  variant={statusFilter === 'on_trip' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusFilter('on_trip')}
                >
                  On Trip
                </Button>
                <Button
                  variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusFilter('inactive')}
                >
                  Inactive
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Drivers List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              My Drivers ({filteredDrivers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredDrivers.map((driver) => {
                const s = stats[driver.user_id]
                const live = s?.currentStatus ?? deriveDriverStatus(driver)
                return (
                <div
                  key={driver.user_id}
                  className={`border rounded-lg transition-shadow hover:shadow-md ${s?.amber ? 'border-amber-400 bg-amber-50' : ''}`}
                  title={s?.amber ? 'High SOS cancellations/rejections in the last 30 days' : undefined}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{driver.user?.full_name || 'Unknown Driver'}</h3>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {driver.user?.email || 'No email'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Car className="h-3 w-3" />
                              License: {driver.license_number}
                            </span>
                            {driver.aadhar_number && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Aadhar: {driver.aadhar_number}
                              </span>
                            )}
                          </div>

                          {/* Additional Information Row */}
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                            <span>
                              Joined {formatDate(driver.user?.created_at || '')}
                            </span>
                            {driver.address_line && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {driver.address_line}
                              </span>
                            )}
                            {driver.current_request_id && (
                              <span className="flex items-center gap-1 text-orange-600">
                                <Clock className="h-3 w-3" />
                                On Assignment
                              </span>
                            )}
                          </div>

                          {/* Location Information */}
                          {(driver.city?.name || driver.state?.name || driver.country?.name) && (
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                              <MapPin className="h-3 w-3" />
                              <span>
                                {[
                                  driver.city?.name,
                                  driver.state?.name,
                                  driver.country?.name
                                ].filter(Boolean).join(', ')}
                                {driver.pincode?.code && ` - ${driver.pincode.code}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right space-y-1.5">
                          <Badge className={LIVE_STATUS_STYLE[live]}>
                            {DRIVER_STATUS_LABEL[live]}
                          </Badge>
                          {/* Auto-updating per-driver summary counts */}
                          <div className="flex items-center justify-end gap-3 text-xs">
                            <span className="text-gray-700">
                              <span className="font-semibold">{s?.totalTrips ?? 0}</span> trips
                            </span>
                            <span className="text-red-700">
                              <span className="font-semibold">{s?.sosCancellations ?? 0}</span> cancel
                            </span>
                            <span className="text-amber-700">
                              <span className="font-semibold">{s?.sosRejections ?? 0}</span> reject
                            </span>
                          </div>
                          {driver.is_verified && (
                            <div className="flex items-center justify-end gap-1 text-sm text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              Verified
                            </div>
                          )}
                          {driver.latitude && driver.longitude && (
                            <div className="flex items-center justify-end gap-1 text-sm text-blue-600">
                              <Navigation className="h-3 w-3" />
                              GPS Active
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/transport/drivers/${driver.user_id}/edit`}>
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Link>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setTripDriver(driver)}>
                                <History className="h-4 w-4 mr-2" />
                                View Trip History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setSosDriver(driver)}>
                                <ClipboardList className="h-4 w-4 mr-2" />
                                View SOS Log
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleStatus(driver)}
                                disabled={togglingId === driver.user_id}
                              >
                                {driver.status === 'inactive' ? (
                                  <><Power className="h-4 w-4 mr-2" />Activate</>
                                ) : (
                                  <><Ban className="h-4 w-4 mr-2" />Deactivate</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`mailto:${driver.user?.email}`)}>
                                <Mail className="h-4 w-4 mr-2" />
                                Send Email
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteDriver(driver)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Driver
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                )
              })}
              {filteredDrivers.length === 0 && (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 mb-2">
                    {drivers.length === 0 ? 'No drivers yet' : 'No drivers match your search'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {drivers.length === 0 
                      ? 'Add your first driver to get started with your transport company'
                      : 'Try adjusting your search terms or filters'
                    }
                  </p>
                  {drivers.length === 0 && (
                    <Button asChild>
                      <Link href="/transport/drivers/add">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Your First Driver
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Driver</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{driverToDelete?.user?.full_name}</strong>?
                This action cannot be undone and will permanently remove the driver from your system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteDriver}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Driver
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* CSV Import Dialog */}
        <Dialog open={csvDialogOpen} onOpenChange={handleCsvDialogClose}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Import Drivers from CSV
              </DialogTitle>
              <DialogDescription>
                Upload a CSV file to bulk import drivers. All drivers will be added to your transport company. Download the template for the correct format.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleCsvFileChange}
                  disabled={csvUploading}
                />
                {csvFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {csvFile.name}
                  </p>
                )}
              </div>

              {csvResult && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">{csvResult.success} drivers added</span>
                    </div>
                    {csvResult.failed > 0 && (
                      <div className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">{csvResult.failed} failed</span>
                      </div>
                    )}
                  </div>
                  {csvResult.errors.length > 0 && (
                    <div className="max-h-32 overflow-y-auto">
                      {csvResult.errors.slice(0, 5).map((error, i) => (
                        <p key={i} className="text-xs text-red-600">{error}</p>
                      ))}
                      {csvResult.errors.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          ...and {csvResult.errors.length - 5} more errors
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCsvDialogClose}>
                Cancel
              </Button>
              <Button onClick={handleCsvUpload} disabled={!csvFile || csvUploading}>
                {csvUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Trip History / SOS Log modals (US-T03, US-T04) */}
        {tripDriver && (
          <TripHistoryDialog
            driverId={tripDriver.user_id}
            driverName={tripDriver.user?.full_name || 'Driver'}
            open={!!tripDriver}
            onOpenChange={(o) => { if (!o) setTripDriver(null) }}
          />
        )}
        {sosDriver && (
          <SosLogDialog
            driverId={sosDriver.user_id}
            driverName={sosDriver.user?.full_name || 'Driver'}
            open={!!sosDriver}
            onOpenChange={(o) => { if (!o) setSosDriver(null) }}
          />
        )}
      </div>
    </RoleGuard>
  )
}
