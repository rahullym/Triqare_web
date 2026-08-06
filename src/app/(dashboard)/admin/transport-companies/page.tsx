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
  Building2,
  MapPin,
  Users,
  Shield,
  ShieldCheck,
  Edit,
  Trash2,
  Eye,
  Filter,
  X,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react'
import Link from 'next/link'
import { useTransportCompanies, useDeleteTransportCompany, useTransportCompanyStats } from '@/hooks/useTransportCompanies'
import { useCountries, useStates, useCities } from '@/hooks/useLocations'
import { useServerPagination } from '@/hooks/useServerPagination'
import { uploadCsvInChunks, type CsvChunkProgress } from '@/lib/csv/uploadCsvInChunks'
import { PaginationWithInfo } from '@/components/ui/pagination'

export default function TransportCompaniesPage() {
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [companyToDelete, setCompanyToDelete] = useState<any>(null)

  // CSV Import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [csvProgress, setCsvProgress] = useState<CsvChunkProgress | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pagination
  const { currentPage, pageSize, setCurrentPage, setPageSize } = useServerPagination()

  // Location hooks
  const { countries } = useCountries()
  const { states } = useStates(countryFilter || undefined)
  const { cities } = useCities(stateFilter || undefined)

  // Data hooks
  const filters = useMemo(() => ({
    search: searchQuery || undefined,
    is_verified: verificationFilter ? verificationFilter === 'true' : undefined,
    country_id: countryFilter || undefined,
    state_id: stateFilter || undefined,
    city_id: cityFilter || undefined,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize
  }), [searchQuery, verificationFilter, countryFilter, stateFilter, cityFilter, currentPage, pageSize])

  const { transportCompanies, loading, error, count, refetch } = useTransportCompanies(filters)
  const { stats, loading: statsLoading } = useTransportCompanyStats()
  const { deleteTransportCompany, loading: deleteLoading } = useDeleteTransportCompany()

  // Pagination calculations
  const totalPages = Math.ceil(count / pageSize)
  const hasNextPage = currentPage < totalPages
  const hasPreviousPage = currentPage > 1
  const startIndex = (currentPage - 1) * pageSize + 1
  const endIndex = Math.min(currentPage * pageSize, count)

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
  const handleDeleteClick = (company: any) => {
    setCompanyToDelete(company)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return

    try {
      await deleteTransportCompany(companyToDelete.user_id)
      toast.success('Transport company deleted successfully')
      refetch()
      setDeleteDialogOpen(false)
      setCompanyToDelete(null)
    } catch (error) {
      toast.error('Failed to delete transport company')
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
    setCsvProgress(null)

    // Uploaded a few rows at a time: provisioning a login per company is slow
    // enough that a full file overran the serverless function timeout, and the
    // dead connection surfaced as "Network error / 0 imported" even though rows
    // had been created. See uploadCsvInChunks.
    const result = await uploadCsvInChunks('/api/transport-companies/upload-csv', csvFile, {
      onProgress: setCsvProgress
    })

    setCsvResult(result)
    setCsvProgress(null)
    setCsvUploading(false)

    if (result.success > 0) {
      toast.success(`Successfully imported ${result.success} transport companies`)
      refetch()
    }
    if (result.failed > 0) {
      toast.warning(`${result.failed} record(s) failed to import`)
    }
    if (result.success === 0 && result.failed === 0 && result.errors.length > 0) {
      toast.error(result.errors[0])
    }
  }

  const handleCsvDialogClose = () => {
    setCsvDialogOpen(false)
    setCsvFile(null)
    setCsvResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadTemplate = () => {
    const headers = 'company_name,email,full_name,phone,registration_number,license_valid_till,is_verified,address_line,country_name,state_name,city_name,pincode'
    const sampleRow = 'ABC Transport Services,abc.transport@example.com,John Manager,9876543210,REG123456,31-12-2025,true,"123 Main Street",India,Kerala,Kochi,682001'
    const csv = headers + '\n' + sampleRow

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transport_companies_template.csv'
    a.click()
    URL.revokeObjectURL(url)
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
          <h1 className="text-2xl font-bold text-gray-900">Transport Companies</h1>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-800">
              <X className="h-5 w-5 mr-2" />
              <span>Error loading transport companies: {error}</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Transport Companies</h1>
          <p className="text-gray-600">Manage transport companies and their verification status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Link href="/admin/transport-companies/add">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Transport Company
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified</CardTitle>
              <ShieldCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
              <Shield className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.unverified}</div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search companies..."
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
                { value: "true", label: "Verified" },
                { value: "false", label: "Pending" }
              ]}
              value={verificationFilter}
              onValueChange={(value) => {
                setVerificationFilter(value)
                setCurrentPage(1)
              }}
              placeholder="All Status"
              searchPlaceholder="Search status..."
              emptyText="No status found."
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

      {/* Transport Companies List */}
      <Card>
        <CardHeader>
          <CardTitle>Transport Companies ({count})</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `Showing ${transportCompanies.length} of ${count} companies`}
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
          ) : transportCompanies.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No transport companies found</h3>
              <p className="text-gray-600 mb-4">Get started by adding your first transport company.</p>
              <Link href="/admin/transport-companies/add">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Transport Company
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {transportCompanies.map((company) => (
                <div key={company.user_id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{company.company_name}</h3>
                        {getVerificationBadge(company.is_verified)}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Building2 className="h-4 w-4 mr-2" />
                          {company.registration_number || 'No registration'}
                        </div>
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2" />
                          {company.city?.name || company.state?.name || company.country?.name || 'No location'}
                        </div>
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2" />
                          {company.driver_count || 0} drivers
                        </div>
                        <div>
                          <strong>Contact:</strong> {company.user?.full_name} ({company.user?.email})
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Link href={`/admin/transport-companies/${company.user_id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/admin/transport-companies/${company.user_id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(company)}
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
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={count}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          startIndex={startIndex}
          endIndex={endIndex}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transport Company</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{companyToDelete?.company_name}"? This action cannot be undone and will also remove all associated drivers.
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
              Import Transport Companies from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import transport companies. Download the template for the correct format.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Before you upload</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  Wrap any value containing a comma in double quotes, e.g.{' '}
                  <code>&quot;123 Main Street, Kochi&quot;</code>.
                </li>
                <li>Phone numbers must be 10-digit Indian mobile numbers.</li>
                <li>
                  Dates use DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD. Country, state, city and pincode
                  must match existing master data exactly.
                </li>
                <li>Import companies before drivers — drivers reference companies by name.</li>
              </ul>
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

            {csvUploading && csvProgress && (
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  Importing row {Math.min(csvProgress.processed + 1, csvProgress.total)} of {csvProgress.total}…
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((csvProgress.processed / Math.max(csvProgress.total, 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

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
