'use client'

/**
 * Drivers belonging to one transport company.
 *
 * WHAT WAS WRONG. This page was wired to a `mockDrivers` array: every company —
 * newly created ones included — showed the same three invented drivers (John
 * Smith, Sarah Johnson, Mike Wilson of "Metro Emergency Transport"), and Delete
 * only console.logged. An admin who added a real driver saw the same three
 * strangers afterwards and no sign of the driver they had just created.
 *
 * It now reads the company and its drivers from the API, and the statuses shown
 * are the ones drivers actually have (available / assigned / on_trip / inactive)
 * rather than the invented active/inactive/suspended set.
 */

import { useState, useEffect, useMemo, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PaginationWithInfo } from '@/components/ui/pagination'
import { usePagination } from '@/hooks/usePagination'
import { toast } from 'sonner'
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  FileText,
  ArrowLeft,
  Building2,
  Activity,
  ShieldCheck
} from 'lucide-react'

type DriverStatus = 'available' | 'assigned' | 'on_trip' | 'inactive'

interface Driver {
  id: string
  full_name: string
  phone_number: string
  email: string
  license_number: string
  status: DriverStatus
  is_verified: boolean
}

interface TransportCompany {
  id: string
  name: string
  registration_number: string
}

const STATUS_LABELS: Record<DriverStatus, string> = {
  available: 'Available',
  assigned: 'Assigned',
  on_trip: 'On Trip',
  inactive: 'Inactive'
}

// One page of the API's server-side pagination is plenty: no company in the
// system is anywhere near this many drivers, and the list paginates locally.
const DRIVER_FETCH_LIMIT = 200

export default function CompanyDriversPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<'all' | DriverStatus>('all')
  const [company, setCompany] = useState<TransportCompany | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchDrivers = useCallback(async () => {
    const response = await fetch(
      `/api/drivers?transport_company_id=${resolvedParams.id}&limit=${DRIVER_FETCH_LIMIT}`
    )
    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to load drivers')
    }

    setDrivers(
      (data.drivers || []).map((driver: any) => ({
        id: driver.user_id,
        full_name: driver.user?.full_name || 'Unnamed driver',
        phone_number: driver.user?.phone || '',
        email: driver.user?.email || '',
        license_number: driver.license_number || '',
        status: (driver.status || 'available') as DriverStatus,
        is_verified: !!driver.is_verified
      }))
    )
  }, [resolvedParams.id])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const companyResponse = await fetch(`/api/transport-companies/${resolvedParams.id}`)
        const companyData = await companyResponse.json()

        if (companyResponse.ok && companyData.transportCompany) {
          setCompany({
            id: companyData.transportCompany.user_id,
            name: companyData.transportCompany.company_name,
            registration_number: companyData.transportCompany.registration_number || 'No registration number'
          })
        }

        await fetchDrivers()
      } catch (error) {
        console.error('Error loading company drivers:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to load drivers')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [resolvedParams.id, fetchDrivers])

  const filteredDrivers = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return drivers.filter(driver => {
      const matchesSearch =
        driver.full_name.toLowerCase().includes(term) ||
        driver.email.toLowerCase().includes(term) ||
        driver.license_number.toLowerCase().includes(term)
      const matchesStatus = selectedStatus === 'all' || driver.status === selectedStatus
      return matchesSearch && matchesStatus
    })
  }, [drivers, searchTerm, selectedStatus])

  // Setup pagination
  const pagination = usePagination(filteredDrivers, {
    initialPageSize: 10,
    pageSizeOptions: [5, 10, 20, 50]
  })

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This action cannot be undone.`)) return

    setDeletingId(id)
    try {
      const response = await fetch(`/api/drivers/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete driver')
      }
      toast.success(`${name} deleted`)
      await fetchDrivers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete driver')
    } finally {
      setDeletingId(null)
    }
  }

  const countByStatus = (status: DriverStatus) => drivers.filter(d => d.status === status).length

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Company not found</h3>
              <Button onClick={() => router.push('/admin/transport-companies')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Companies
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {company.name} — Drivers
            </h1>
            <p className="text-gray-600">
              Manage drivers for {company.name} ({company.registration_number})
            </p>
          </div>
        </div>
        <Button asChild>
          <a href={`/admin/transport-companies/${resolvedParams.id}/drivers/add`}>
            <Plus className="h-4 w-4 mr-2" />
            Add Driver
          </a>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Drivers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{drivers.length}</div>
            <p className="text-xs text-muted-foreground">
              Registered drivers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {countByStatus('available')}
            </div>
            <p className="text-xs text-muted-foreground">
              Ready for dispatch
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <ShieldCheck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {drivers.filter(d => d.is_verified).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Verified drivers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search drivers by name, email, or license number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedStatus === 'all' ? 'default' : 'outline'}
                onClick={() => setSelectedStatus('all')}
                size="sm"
              >
                All ({drivers.length})
              </Button>
              {(Object.keys(STATUS_LABELS) as DriverStatus[]).map(status => (
                <Button
                  key={status}
                  variant={selectedStatus === status ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus(status)}
                  size="sm"
                >
                  {STATUS_LABELS[status]} ({countByStatus(status)})
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drivers List */}
      {filteredDrivers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No drivers found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || selectedStatus !== 'all'
                  ? 'Try adjusting your search criteria.'
                  : 'This company has no drivers yet.'}
              </p>
              {!searchTerm && selectedStatus === 'all' && (
                <Button asChild>
                  <a href={`/admin/transport-companies/${resolvedParams.id}/drivers/add`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Driver
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6">
            {pagination.currentPageData.map((driver) => (
              <Card key={driver.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900">{driver.full_name}</h3>
                        <Badge variant={driver.status === 'inactive' ? 'secondary' : 'default'}>
                          {STATUS_LABELS[driver.status]}
                        </Badge>
                        {driver.is_verified && (
                          <Badge variant="outline" className="text-green-700 border-green-300">
                            Verified
                          </Badge>
                        )}
                        {driver.license_number && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {driver.license_number}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center text-gray-600">
                          <Phone className="h-4 w-4 mr-2" />
                          {driver.phone_number || 'No phone number'}
                        </div>
                        <div className="flex items-center text-gray-600">
                          <Mail className="h-4 w-4 mr-2" />
                          {driver.email || 'No email'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/admin/drivers/${driver.id}`}>
                          <FileText className="h-4 w-4 mr-1" />
                          View
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/admin/drivers/${driver.id}/edit`}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(driver.id, driver.full_name)}
                        disabled={deletingId === driver.id}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {deletingId === driver.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-6">
            <PaginationWithInfo
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={pagination.goToPage}
              hasNextPage={pagination.hasNextPage}
              hasPreviousPage={pagination.hasPreviousPage}
              startIndex={pagination.startIndex}
              endIndex={pagination.endIndex}
              totalItems={pagination.totalItems}
              pageSize={pagination.pageSize}
              pageSizeOptions={pagination.pageSizeOptions}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        </>
      )}
    </div>
  )
}
