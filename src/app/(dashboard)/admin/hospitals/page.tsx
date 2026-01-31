'use client'

import { useState, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaginationWithInfo } from '@/components/ui/pagination'
import { Progress } from '@/components/ui/progress'
import { useServerPagination } from '@/hooks/useServerPagination'
import { useHospitals, useHospitalStats } from '@/hooks/useHospitals'
import { useAllLocations, useCountries, useStates } from '@/hooks/useLocations'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Building2,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Phone,
  MapPin,
  Users,
  Bed,
  Activity,
  Clock,
  Star,
  Loader2,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  Globe
} from 'lucide-react'
import Link from 'next/link'

export default function AdminHospitalsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [pincodeFilter, setPincodeFilter] = useState<string>('all')

  // Dialog state for delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [hospitalToDelete, setHospitalToDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // CSV upload state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Google scraping state
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<{ success: number; failed: number; skipped: number; errors: string[]; total?: number } | null>(null)
  const [scrapeCountry, setScrapeCountry] = useState('')
  const [scrapeState, setScrapeState] = useState('')
  const [scrapeMaxResults, setScrapeMaxResults] = useState(60)
  const [scrapeProgress, setScrapeProgress] = useState(0)
  const [scrapeMessage, setScrapeMessage] = useState('')
  const [scrapeCurrentHospital, setScrapeCurrentHospital] = useState('')
  const [scrapeProcessed, setScrapeProcessed] = useState(0)
  const [scrapeTotal, setScrapeTotal] = useState(0)

  // Pagination state
  const { currentPage, pageSize, setCurrentPage, setPageSize } = useServerPagination()

  // Use the hospitals hook with filters and pagination
  const {
    hospitals,
    loading,
    error,
    count,
    refetch,
    deleteHospital
  } = useHospitals({
    status: statusFilter,
    city_id: cityFilter,
    pincode_id: pincodeFilter,
    search: searchQuery,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize
  })

  // Use hospital stats hook
  const { stats, loading: statsLoading } = useHospitalStats()

  // Use location data for filters
  const { cities, pincodes, loading: locationsLoading } = useAllLocations()

  // Use location data for scraping
  const { countries, loading: countriesLoading } = useCountries()
  const { states, loading: statesLoading } = useStates(scrapeCountry)

  // Helper functions to get location names
  const getCityName = (cityId: string) => {
    const city = cities.find(c => c.id === cityId)
    return city ? city.name : 'Unknown City'
  }

  const getPincodeName = (pincodeId: string) => {
    const pincode = pincodes.find(p => p.id === pincodeId)
    return pincode ? pincode.code : 'Unknown Pincode'
  }

  // Pagination calculations
  const totalPages = Math.ceil(count / pageSize)
  const hasNextPage = currentPage < totalPages
  const hasPreviousPage = currentPage > 1
  const startIndex = count > 0 ? (currentPage - 1) * pageSize + 1 : 0
  const endIndex = Math.min(currentPage * pageSize, count)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'under_review': return 'bg-yellow-100 text-yellow-800'
      case 'suspended': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'government': return 'bg-blue-100 text-blue-800'
      case 'private': return 'bg-purple-100 text-purple-800'
      case 'specialty': return 'bg-orange-100 text-orange-800'
      case 'other': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Handle delete hospital - open dialog
  const handleDeleteClick = (hospital: { id: string; name: string }) => {
    setHospitalToDelete(hospital)
    setDeleteDialogOpen(true)
  }

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!hospitalToDelete) return

    setDeleteLoading(true)
    try {
      const result = await deleteHospital(hospitalToDelete.id)
      if (result.success) {
        toast.success('Hospital deleted successfully')
        setDeleteDialogOpen(false)
        setHospitalToDelete(null)
      } else {
        toast.error(result.error || 'Failed to delete hospital')
      }
    } catch (error) {
      toast.error('Failed to delete hospital')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Handle delete cancel
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setHospitalToDelete(null)
    setDeleteLoading(false)
  }

  // Handle CSV file selection
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

  // Handle CSV upload
  const handleCsvUpload = async () => {
    if (!csvFile) return

    setCsvUploading(true)
    setCsvResult(null)

    try {
      const formData = new FormData()
      formData.append('file', csvFile)

      const response = await fetch('/api/hospitals/upload-csv', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (response.ok) {
        setCsvResult({ success: result.success, failed: result.failed, errors: result.errors || [] })
        if (result.success > 0) {
          toast.success(`Successfully imported ${result.success} hospitals`)
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

  // Reset CSV dialog
  const handleCsvDialogClose = () => {
    setCsvDialogOpen(false)
    setCsvFile(null)
    setCsvResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Download sample CSV template
  const downloadTemplate = () => {
    const headers = 'name,hospital_type,address_line,phone,email,website,emergency_contact_person,emergency_contact_phone,emergency_contact_email,latitude,longitude,general_operating_hours,emergency_department_hours,additional_notes,status,country_name,state_name,city_name,pincode'
    const sampleRow = 'City General Hospital,government,"123 Main Street, Downtown",+1-555-0100,info@cityhospital.com,https://cityhospital.com,Dr. John Smith,+1-555-0101,emergency@cityhospital.com,40.7128,-74.0060,08:00-20:00,24/7,Main hospital serving downtown area,active,United States,New York,New York City,10001'
    const csv = headers + '\n' + sampleRow

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hospitals_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Scrape hospitals from Google Places API with streaming progress
  const handleScrapeGoogle = async () => {
    // Validation
    if (!scrapeCountry || !scrapeState) {
      toast.error('Please select both country and state')
      return
    }

    setScraping(true)
    setScrapeResult(null)
    setScrapeProgress(0)
    setScrapeMessage('Initializing...')
    setScrapeCurrentHospital('')
    setScrapeProcessed(0)
    setScrapeTotal(0)

    try {
      // Get country and state names
      const country = countries.find(c => c.id === scrapeCountry)
      const state = states.find(s => s.id === scrapeState)

      if (!country || !state) {
        toast.error('Invalid country or state selection')
        setScraping(false)
        return
      }

      const location = `${state.name}, ${country.name}`

      const response = await fetch('/api/hospitals/scrape-google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location,
          countryId: scrapeCountry,
          stateId: scrapeState,
          radius: 50000,
          maxResults: scrapeMaxResults
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start scraping')
      }

      // Read the streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              // Update progress based on event type
              if (data.type === 'progress') {
                setScrapeProgress(data.progress || 0)
                setScrapeMessage(data.message || '')
                if (data.current) setScrapeProcessed(data.current)
                if (data.total) setScrapeTotal(data.total)
                if (data.hospitalName) setScrapeCurrentHospital(data.hospitalName)
              } else if (data.type === 'success') {
                // Hospital successfully imported
                console.log('✅', data.message)
              } else if (data.type === 'skip') {
                // Hospital skipped
                console.log('⏭️', data.message)
              } else if (data.type === 'error') {
                // Error processing hospital
                console.error('❌', data.message)
              } else if (data.type === 'complete') {
                // Scraping complete
                setScrapeProgress(100)
                setScrapeMessage(data.message)
                setScrapeResult(data.results)
                toast.success(data.message)
                refetch() // Refresh the hospitals list
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }

    } catch (error) {
      console.error('Scraping error:', error)
      toast.error('Failed to scrape hospitals')
      setScrapeResult({ success: 0, failed: 0, skipped: 0, errors: ['Network error'] })
    } finally {
      setScraping(false)
    }
  }

  // Reset scrape dialog
  const handleScrapeDialogClose = () => {
    setScrapeDialogOpen(false)
    setScrapeResult(null)
    setScrapeCountry('')
    setScrapeState('')
    setScrapeMaxResults(60)
    setScrapeProgress(0)
    setScrapeMessage('')
    setScrapeCurrentHospital('')
    setScrapeProcessed(0)
    setScrapeTotal(0)
  }

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              🏥 Hospitals Management
            </h1>
            <p className="text-gray-600">
              Manage hospital network and medical facilities
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-blue-100 text-blue-800">
              <Building2 className="h-3 w-3 mr-1" />
              Admin Access
            </Badge>
            <Button variant="outline" onClick={() => setScrapeDialogOpen(true)} className="text-green-600 hover:text-green-700">
              <Globe className="h-4 w-4 mr-2" />
              Scrape Google
            </Button>
            <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Link href="/admin/hospitals/add">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add New Hospital
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hospitals</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.total || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Registered facilities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Hospitals</CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.active || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently operational
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Government</CardTitle>
              <Building2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.government || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Government hospitals
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Private</CardTitle>
              <Building2 className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.private || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Private hospitals
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Hospitals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by name, address, or phone..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>

              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={pincodeFilter} onValueChange={setPincodeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Pincodes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pincodes</SelectItem>
                  {pincodes.map((pincode) => (
                    <SelectItem key={pincode.id} value={pincode.id}>
                      {pincode.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Hospitals List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              All Hospitals ({loading ? '...' : hospitals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-center py-8">
                <div className="text-red-500 mb-2">Error loading hospitals</div>
                <div className="text-sm text-gray-500 mb-4">{error}</div>
                <Button onClick={refetch} variant="outline">
                  <Loader2 className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <div className="text-gray-500">Loading hospitals...</div>
              </div>
            ) : hospitals.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hospitals found matching your search criteria
              </div>
            ) : (
              <div className="space-y-4">
                {hospitals.map((hospital) => (
                <div key={hospital.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold">
                      {hospital.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-3 mb-1">
                        <h4 className="font-semibold text-gray-900">{hospital.name}</h4>
                        <Badge variant="outline" className="font-mono text-xs">
                          {hospital.id}
                        </Badge>
                        <Badge className={getStatusColor(hospital.status)}>
                          {hospital.status.charAt(0).toUpperCase() + hospital.status.slice(1).replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <MapPin className="h-3 w-3 mr-1" />
                          {hospital.address_line}
                        </div>
                        <div className="flex items-center">
                          <Phone className="h-3 w-3 mr-1" />
                          {hospital.phone}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                        <div className="flex items-center">
                          <Building2 className="h-3 w-3 mr-1" />
                          <Badge className={getTypeColor(hospital.hospital_type)}>
                            {hospital.hospital_type ? hospital.hospital_type.charAt(0).toUpperCase() + hospital.hospital_type.slice(1) : 'Unknown'}
                          </Badge>
                        </div>
                        <div className="flex items-center">
                          <MapPin className="h-3 w-3 mr-1" />
                          {getCityName(hospital.city_id || '')} - {getPincodeName(hospital.pincode_id || '')}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 mt-2">
                        <div className="text-xs text-gray-500">
                          Emergency Contact: {hospital.emergency_contact_person}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-sm text-gray-600 mb-2">
                      <div className="flex items-center justify-end mb-1">
                        {hospital.emergency_department_hours === '24/7' && (
                          <Badge className="bg-red-100 text-red-800 text-xs">
                            24/7 Emergency
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs">
                        Hours: {hospital.general_operating_hours || 'Not specified'}
                      </div>
                      <div className="text-xs">Email: {hospital.email || 'Not provided'}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Link href={`/admin/hospitals/${hospital.id}`}>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </Link>
                      <Link href={`/admin/hospitals/${hospital.id}`}>
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteClick({ id: hospital.id, name: hospital.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            )}

            {/* Pagination */}
            {count > 0 && (
              <div className="mt-6">
                <PaginationWithInfo
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  hasNextPage={hasNextPage}
                  hasPreviousPage={hasPreviousPage}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  totalItems={count}
                  pageSize={pageSize}
                  pageSizeOptions={[5, 10, 20, 50, 100]}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Hospital Management Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/admin/hospitals/add">
                <Button variant="outline" className="h-20 flex-col w-full">
                  <Plus className="h-6 w-6 mb-2" />
                  Add New Hospital
                </Button>
              </Link>
              <Button variant="outline" className="h-20 flex-col">
                <Bed className="h-6 w-6 mb-2" />
                Bed Management
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Activity className="h-6 w-6 mb-2" />
                Capacity Reports
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Clock className="h-6 w-6 mb-2" />
                Inspection Schedule
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Hospital</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{hospitalToDelete?.name}</strong>?
                This action cannot be undone and will permanently remove the hospital from the system.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Hospital
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CSV Upload Dialog */}
        <Dialog open={csvDialogOpen} onOpenChange={handleCsvDialogClose}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Import Hospitals from CSV
              </DialogTitle>
              <DialogDescription>
                Upload a CSV file to bulk import hospitals. Download the template for the correct format.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Download Template */}
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-800">Download CSV template with sample data</span>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  Download Template
                </Button>
              </div>

              {/* File Input */}
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
                  <p className="text-sm text-gray-600">
                    Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {/* Upload Result */}
              {csvResult && (
                <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
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
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      <p className="text-xs font-medium text-gray-700 mb-1">Errors:</p>
                      {csvResult.errors.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-xs text-red-600">{err}</p>
                      ))}
                      {csvResult.errors.length > 5 && (
                        <p className="text-xs text-gray-500">...and {csvResult.errors.length - 5} more errors</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Required Fields Info */}
              <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
                <p className="font-medium mb-1">Required CSV columns:</p>
                <p>name, hospital_type, address_line, phone, emergency_contact_person, emergency_contact_phone</p>
                <p className="mt-1">Optional: email, website, latitude, longitude, status, country_name, state_name, city_name, pincode</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCsvDialogClose} disabled={csvUploading}>
                {csvResult ? 'Close' : 'Cancel'}
              </Button>
              {!csvResult && (
                <Button onClick={handleCsvUpload} disabled={!csvFile || csvUploading}>
                  {csvUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload & Import
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Google Scraping Dialog */}
        <Dialog open={scrapeDialogOpen} onOpenChange={setScrapeDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-green-600" />
                Scrape Hospitals from Google Places
              </DialogTitle>
              <DialogDescription>
                Automatically fetch hospital data from Google Places API for your selected location.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Location Selection */}
              {!scrapeResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="scrape-country">Country *</Label>
                      <Select
                        value={scrapeCountry}
                        onValueChange={setScrapeCountry}
                        disabled={scraping || countriesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={countriesLoading ? "Loading..." : "Select country"} />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.id} value={country.id}>
                              {country.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="scrape-state">State *</Label>
                      <Select
                        value={scrapeState}
                        onValueChange={setScrapeState}
                        disabled={scraping || statesLoading || !scrapeCountry}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !scrapeCountry ? "Select country first" :
                            statesLoading ? "Loading..." :
                            "Select state"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((state) => (
                            <SelectItem key={state.id} value={state.id}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="scrape-max-results">Maximum Results</Label>
                    <Input
                      id="scrape-max-results"
                      type="number"
                      min="10"
                      max="200"
                      value={scrapeMaxResults}
                      onChange={(e) => setScrapeMaxResults(parseInt(e.target.value) || 60)}
                      disabled={scraping}
                      placeholder="60"
                    />
                    <p className="text-xs text-gray-500 mt-1">Number of hospitals to fetch (10-200)</p>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              {scraping && (
                <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-blue-900">Scraping in Progress...</h4>
                    <span className="text-sm font-medium text-blue-700">{scrapeProgress}%</span>
                  </div>
                  <Progress value={scrapeProgress} className="h-2" />
                  <div className="space-y-1">
                    <p className="text-sm text-blue-800">{scrapeMessage}</p>
                    {scrapeCurrentHospital && (
                      <p className="text-xs text-blue-600">Current: {scrapeCurrentHospital}</p>
                    )}
                    {scrapeTotal > 0 && (
                      <p className="text-xs text-blue-600">
                        Processed: {scrapeProcessed} / {scrapeTotal}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Info Box */}
              {!scraping && !scrapeResult && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 className="font-medium text-green-900 mb-2">What will happen:</h4>
                  <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
                    <li>Search for hospitals in selected location using Google Places API</li>
                    <li>Fetch hospital records with details (name, address, phone, location, hours)</li>
                    <li>Automatically populate: name, address, phone, location, hours</li>
                    <li>Skip hospitals that already exist in the database</li>
                    <li>Process may take 1-2 minutes to complete</li>
                  </ul>
                </div>
              )}

              {/* Scrape Result */}
              {scrapeResult && (
                <div className="space-y-2 p-4 bg-gray-50 rounded-lg border">
                  <h4 className="font-medium text-gray-900 mb-2">Scraping Results:</h4>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">{scrapeResult.success} imported</span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-600">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">{scrapeResult.skipped} skipped (already exist)</span>
                    </div>
                    {scrapeResult.failed > 0 && (
                      <div className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">{scrapeResult.failed} failed</span>
                      </div>
                    )}
                  </div>
                  {scrapeResult.errors.length > 0 && (
                    <div className="mt-3 max-h-40 overflow-y-auto">
                      <p className="text-xs font-medium text-gray-700 mb-1">Errors:</p>
                      {scrapeResult.errors.slice(0, 10).map((err, i) => (
                        <p key={i} className="text-xs text-red-600">{err}</p>
                      ))}
                      {scrapeResult.errors.length > 10 && (
                        <p className="text-xs text-gray-500">...and {scrapeResult.errors.length - 10} more errors</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Warning */}
              {!scrapeResult && (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This will use your Google Maps API quota. Make sure you have sufficient quota available.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleScrapeDialogClose} disabled={scraping}>
                {scrapeResult ? 'Close' : 'Cancel'}
              </Button>
              {!scrapeResult && (
                <Button onClick={handleScrapeGoogle} disabled={scraping} className="bg-green-600 hover:bg-green-700">
                  {scraping ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Scraping... Please wait
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4 mr-2" />
                      Start Scraping
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}
