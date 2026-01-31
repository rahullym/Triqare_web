'use client'

import { useState, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

import {
  Plus,
  Search,
  UserCheck,
  MapPin,
  Users,
  Shield,
  ShieldCheck,
  Edit,
  Trash2,
  Eye,
  Filter,
  X,
  Car,
  Clock,
  Navigation,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react'
import Link from 'next/link'
import { useDrivers, useDeleteDriver, useDriverStats } from '@/hooks/useDrivers'
import { useTransportCompanies } from '@/hooks/useTransportCompanies'
import { useCountries, useStates, useCities } from '@/hooks/useLocations'
import { useServerPagination } from '@/hooks/useServerPagination'
import { PaginationWithInfo } from '@/components/ui/pagination'

export default function DriversPage() {
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [driverToDelete, setDriverToDelete] = useState<any>(null)

  // CSV Import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Quick action states
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null)

  // Pagination
  const { currentPage, pageSize, setCurrentPage, setPageSize } = useServerPagination()

  // Location hooks
  const { countries } = useCountries()
  const { states } = useStates(countryFilter || undefined)
  const { cities } = useCities(stateFilter || undefined)

  // Transport companies for filter
  const { transportCompanies: allCompanies } = useTransportCompanies({ limit: 1000 })

  // Data hooks
  const filters = useMemo(() => ({
    search: searchQuery || undefined,
    status: (statusFilter && statusFilter !== '') ? statusFilter as 'available' | 'assigned' | 'on_trip' | 'inactive' : undefined,
    transport_company_id: companyFilter || undefined,
    is_verified: verificationFilter ? verificationFilter === 'true' : undefined,
    country_id: countryFilter || undefined,
    state_id: stateFilter || undefined,
    city_id: cityFilter || undefined,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize
  }), [searchQuery, statusFilter, companyFilter, verificationFilter, countryFilter, stateFilter, cityFilter, currentPage, pageSize])

  const { drivers, loading, error, count, refetch } = useDrivers(filters)
  const { stats, loading: statsLoading } = useDriverStats()
  const { deleteDriver, loading: deleteLoading } = useDeleteDriver()

  // Pagination calculations
  const totalPages = Math.ceil(count / pageSize)

  // Handle country change (reset dependent filters)
  const handleCountryChange = (value: string) => {
    setCountryFilter(value)
    setStateFilter('')
    setCityFilter('')
    setCurrentPage(1)
  }

  // Handle state change (reset city filter)
  const handleStateChange = (value: string) => {
    setStateFilter(value)
    setCityFilter('')
    setCurrentPage(1)
  }

  // Handle delete
  const handleDeleteClick = (driver: any) => {
    setDriverToDelete(driver)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!driverToDelete) return

    try {
      await deleteDriver(driverToDelete.user_id)
      toast.success('Driver deleted successfully')
      refetch()
      setDeleteDialogOpen(false)
      setDriverToDelete(null)
    } catch (error) {
      toast.error('Failed to delete driver')
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

      const response = await fetch('/api/drivers/upload-csv', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (response.ok) {
        setCsvResult({ success: result.success, failed: result.failed, errors: result.errors || [] })
        if (result.success > 0) {
          toast.success(`Successfully imported ${result.success} drivers`)
          refetch()
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

  const downloadTemplate = async () => {
    // Fetch first transport company to use as example
    let transportCompanyName = 'Your Transport Company Name'
    try {
      const response = await fetch('/api/transport-companies')
      if (response.ok) {
        const data = await response.json()
        if (data.transportCompanies && data.transportCompanies.length > 0) {
          transportCompanyName = data.transportCompanies[0].company_name
        }
      }
    } catch (error) {
      console.error('Failed to fetch transport companies:', error)
    }

    const headers = 'full_name,email,phone,license_number,aadhar_number,status,is_verified,transport_company_name,latitude,longitude,address_line,country_name,state_name,city_name,pincode'
    const sampleRow = `John Driver,john.driver@example.com,9876543210,DL-1234567890,123456789012,available,true,${transportCompanyName},12.9716,77.5946,"123 Main Street",India,Kerala,Kochi,682001`
    const csv = headers + '\n' + sampleRow

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'drivers_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Quick action handlers
  const handleToggleVerification = async (driverId: string, currentStatus: boolean) => {
    setUpdatingDriverId(driverId)
    try {
      const response = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_verified: !currentStatus
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update verification status')
      }

      toast.success(`Driver ${!currentStatus ? 'verified' : 'unverified'} successfully`)
      refetch()
    } catch (error) {
      console.error('Error updating verification:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update verification status')
    } finally {
      setUpdatingDriverId(null)
    }
  }

  const handleQuickStatusChange = async (driverId: string, newStatus: 'available' | 'assigned' | 'on_trip' | 'inactive') => {
    setUpdatingDriverId(driverId)
    try {
      const response = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update status')
      }

      toast.success(`Driver status updated to ${newStatus}`)
      refetch()
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update status')
    } finally {
      setUpdatingDriverId(null)
    }
  }

  // Get status badge
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      available: { color: 'bg-green-100 text-green-800', icon: ShieldCheck, label: 'Available' },
      assigned: { color: 'bg-blue-100 text-blue-800', icon: Car, label: 'Assigned' },
      on_trip: { color: 'bg-purple-100 text-purple-800', icon: Navigation, label: 'On Trip' },
      inactive: { color: 'bg-gray-100 text-gray-800', icon: Clock, label: 'Inactive' }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive
    const Icon = config.icon

    return (
      <Badge variant="secondary" className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    )
  }

  // Get verification status badge
  const getVerificationBadge = (isVerified: boolean) => {
    return isVerified ? (
      <Badge variant="default" className="bg-green-100 text-green-800">
        <ShieldCheck className="h-3 w-3 mr-1" />
        Verified
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
        <Shield className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-800">
              <X className="h-5 w-5 mr-2" />
              <span>Error loading drivers: {error}</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
          <p className="text-gray-600">Manage drivers and their status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Link href="/admin/drivers/add">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Driver
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Drivers</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available</CardTitle>
              <ShieldCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.available}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On Trip</CardTitle>
              <Navigation className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.on_trip}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assigned</CardTitle>
              <Car className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.assigned}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified</CardTitle>
              <Shield className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search drivers..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <Combobox
              options={[
                { value: "", label: "All Status" },
                { value: "available", label: "Available" },
                { value: "assigned", label: "Assigned" },
                { value: "on_trip", label: "On Trip" },
                { value: "inactive", label: "Inactive" }
              ]}
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}
              placeholder="All Status"
              searchPlaceholder="Search status..."
              emptyText="No status found."
            />
            <Combobox
              options={[
                { value: "", label: "All Companies" },
                ...(allCompanies?.map((company): ComboboxOption => ({
                  value: company.user_id,
                  label: company.company_name
                })) || [])
              ]}
              value={companyFilter}
              onValueChange={(value) => {
                setCompanyFilter(value)
                setCurrentPage(1)
              }}
              placeholder="All Companies"
              searchPlaceholder="Search companies..."
              emptyText="No companies found."
            />
            <Combobox
              options={[
                { value: "", label: "All Verification" },
                { value: "true", label: "Verified" },
                { value: "false", label: "Pending" }
              ]}
              value={verificationFilter}
              onValueChange={(value) => {
                setVerificationFilter(value)
                setCurrentPage(1)
              }}
              placeholder="All Verification"
              searchPlaceholder="Search verification..."
              emptyText="No verification found."
            />
            <Combobox
              options={[
                { value: "", label: "All Countries" },
                ...(countries?.map((country): ComboboxOption => ({
                  value: country.id,
                  label: country.name
                })) || [])
              ]}
              value={countryFilter}
              onValueChange={handleCountryChange}
              placeholder="All Countries"
              searchPlaceholder="Search countries..."
              emptyText="No countries found."
            />
            <Combobox
              options={[
                { value: "", label: "All States" },
                ...(states?.map((state): ComboboxOption => ({
                  value: state.id,
                  label: state.name
                })) || [])
              ]}
              value={stateFilter}
              onValueChange={handleStateChange}
              disabled={!countryFilter}
              placeholder="All States"
              searchPlaceholder="Search states..."
              emptyText="No states found."
            />
            <Combobox
              options={[
                { value: "", label: "All Cities" },
                ...(cities?.map((city): ComboboxOption => ({
                  value: city.id,
                  label: city.name
                })) || [])
              ]}
              value={cityFilter}
              onValueChange={(value) => {
                setCityFilter(value)
                setCurrentPage(1)
              }}
              disabled={!stateFilter}
              placeholder="All Cities"
              searchPlaceholder="Search cities..."
              emptyText="No cities found."
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery('')
              setStatusFilter('')
              setCompanyFilter('')
              setVerificationFilter('')
              setCountryFilter('')
              setStateFilter('')
              setCityFilter('')
              setCurrentPage(1)
            }}
          >
            Clear All
          </Button>
        </CardContent>
      </Card>
      {/* Drivers List */}
      <Card>
        <CardHeader>
          <CardTitle>Drivers ({count})</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `Showing ${drivers.length} of ${count} drivers`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-20 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-8">
              <UserCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No drivers found</h3>
              <p className="text-gray-600 mb-4">Get started by adding your first driver.</p>
              <Link href="/admin/drivers/add">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Driver
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {drivers.map((driver) => (
                <div key={driver.user_id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{driver.user?.full_name}</h3>
                        {getStatusBadge(driver.status)}
                        {getVerificationBadge(driver.is_verified)}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <UserCheck className="h-4 w-4 mr-2" />
                          {driver.license_number || 'No license'}
                        </div>
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2" />
                          {driver.transport_company?.company_name || 'No company'}
                        </div>
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2" />
                          {driver.city?.name || driver.state?.name || driver.country?.name || 'No location'}
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2" />
                          {driver.last_updated_at ? new Date(driver.last_updated_at).toLocaleDateString() : 'Never'}
                        </div>
                      </div>
                      {driver.latitude && driver.longitude && (
                        <div className="mt-2 text-xs text-gray-500">
                          Location: {driver.latitude.toFixed(6)}, {driver.longitude.toFixed(6)}
                        </div>
                      )}

                      {/* Quick Actions */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant={driver.is_verified ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleVerification(driver.user_id, driver.is_verified)}
                          disabled={updatingDriverId === driver.user_id}
                          className={driver.is_verified ? "bg-green-600 hover:bg-green-700" : "border-green-600 text-green-600 hover:bg-green-50"}
                        >
                          {updatingDriverId === driver.user_id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : driver.is_verified ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {driver.is_verified ? 'Verified' : 'Verify'}
                        </Button>

                        {driver.status !== 'available' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickStatusChange(driver.user_id, 'available')}
                            disabled={updatingDriverId === driver.user_id}
                            className="border-green-600 text-green-600 hover:bg-green-50"
                          >
                            {updatingDriverId === driver.user_id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3 w-3 mr-1" />
                            )}
                            Set Available
                          </Button>
                        )}

                        {driver.status !== 'inactive' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickStatusChange(driver.user_id, 'inactive')}
                            disabled={updatingDriverId === driver.user_id}
                            className="border-gray-600 text-gray-600 hover:bg-gray-50"
                          >
                            {updatingDriverId === driver.user_id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Clock className="h-3 w-3 mr-1" />
                            )}
                            Set Inactive
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Link href={`/admin/drivers/${driver.user_id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/admin/drivers/${driver.user_id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(driver)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <PaginationWithInfo
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          hasNextPage={currentPage < totalPages}
          hasPreviousPage={currentPage > 1}
          startIndex={(currentPage - 1) * pageSize + 1}
          endIndex={Math.min(currentPage * pageSize, count)}
          totalItems={count}
          pageSize={pageSize}
          pageSizeOptions={[5, 10, 20, 50, 100]}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Driver</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{driverToDelete?.user?.full_name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={handleCsvDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Drivers from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import drivers. Download the template for the correct format.
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
                    <span className="text-sm font-medium">{csvResult.success} imported</span>
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
    </div>
  )
}
