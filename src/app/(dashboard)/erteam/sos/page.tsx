'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertTriangle,
  Zap,
  Search,
  MapPin,
  Clock,
  Phone,
  Truck,
  CheckCircle,
  XCircle,
  Timer,
  Activity,
  Plus,
  Edit,
  Trash2,
  User,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react'
import { SOSService, type SOSRequest, type Patient, type Driver } from '@/services/sosService'
import { toast } from 'sonner'
import { useSOSRequestsRealtime } from '@/hooks/useSOSRequestsRealtime'

export default function ERTSOSPage() {
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // Use realtime hook for SOS requests
  const { sosRequests, loading, error: sosError, refetch, isConnected } = useSOSRequestsRealtime({
    enabled: true,
    playAlertSound: true,
    onInsert: (sos) => {
      toast.error(`🚨 NEW EMERGENCY from ${sos.patient?.full_name || 'Unknown Patient'}!`, {
        duration: 10000,
        action: {
          label: 'View',
          onClick: () => setActiveTab('SOS Triggered')
        }
      })
    },
    onUpdate: (sos) => {
      toast.info(`SOS request status updated to ${sos.status}`)
    }
  })

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedSOS, setSelectedSOS] = useState<SOSRequest | null>(null)
  const [selectedPatient, setSelectedPatient] = useState('')
  const [selectedDriver, setSelectedDriver] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<SOSRequest['status']>('SOS Triggered')
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Load patients and drivers (SOS requests come from realtime hook)
  const loadData = async () => {
    try {
      const [patientsResult, driversResult] = await Promise.all([
        SOSService.getPatients(),
        SOSService.getAvailableDrivers() // Only load available drivers
      ])

      if (patientsResult.error) {
        toast.error(`Failed to load patients: ${patientsResult.error}`)
      } else {
        console.log('Loaded patients with reference data:', patientsResult.data)
        console.log('Sample patient data:', patientsResult.data?.[0])
        setPatients(patientsResult.data || [])
      }

      if (driversResult.error) {
        toast.error(`Failed to load drivers: ${driversResult.error}`)
      } else {
        setDrivers(driversResult.data || [])
      }
    } catch (error) {
      toast.error('Failed to load data')
    }
  }

  // Refresh data
  const refreshData = async () => {
    setRefreshing(true)
    await Promise.all([
      loadData(), // Load patients and drivers
      refetch() // Refetch SOS requests from realtime hook
    ])
    setRefreshing(false)
    toast.success('Data refreshed')
  }

  useEffect(() => {
    loadData()
  }, [])

  // Action handlers
  const handleCreateSOS = async () => {
    if (!selectedPatient) {
      toast.error('Please select a patient')
      return
    }

    try {
      const { data, error } = await SOSService.createSOSRequest(selectedPatient)
      if (error) {
        toast.error(`Failed to create SOS: ${error}`)
      } else {
        toast.success('SOS request created successfully')
        setCreateDialogOpen(false)
        setSelectedPatient('')
        await loadData()
      }
    } catch (error) {
      toast.error('Failed to create SOS request')
    }
  }

  const handleAssignDriver = async () => {
    if (!selectedSOS || !selectedDriver) {
      toast.error('Please select a driver')
      return
    }

    try {
      const response = await fetch(`/api/sos/${selectedSOS.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_driver', driver_id: selectedDriver })
      })

      const result = await response.json()
      if (result.error) {
        toast.error(`Failed to assign driver: ${result.error}`)
      } else {
        toast.success('Driver assigned successfully')
        setAssignDialogOpen(false)
        setSelectedDriver('')
        setSelectedSOS(null)
        await Promise.all([refetch(), loadData()])
      }
    } catch (error) {
      toast.error('Failed to assign driver')
    }
  }

  const handleUpdateStatus = async () => {
    if (!selectedSOS) return

    try {
      const response = await fetch(`/api/sos/${selectedSOS.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', status: selectedStatus })
      })

      const result = await response.json()
      if (result.error) {
        toast.error(`Failed to update status: ${result.error}`)
      } else {
        toast.success('Status updated successfully')
        setStatusDialogOpen(false)
        setSelectedSOS(null)
        refetch()
      }
    } catch (error) {
      toast.error('Failed to update status')
    }
  }

  const handleDeleteSOS = async () => {
    if (!selectedSOS) return

    try {
      setDeleteLoading(true)
      const response = await fetch(`/api/sos/${selectedSOS.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()
      if (result.error) {
        toast.error(`Failed to delete SOS request: ${result.error}`)
      } else {
        toast.success('SOS request deleted successfully')
        setDeleteDialogOpen(false)
        setSelectedSOS(null)
        await loadData()
      }
    } catch (error) {
      toast.error('Failed to delete SOS request')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Utility functions
  const getStatusColor = (status: SOSRequest['status']) => {
    switch (status) {
      case 'SOS Triggered': return 'bg-red-100 text-red-800'
      case 'Driver En Route': return 'bg-blue-100 text-blue-800'
      case 'Transport Arrived': return 'bg-yellow-100 text-yellow-800'
      case 'User Picked Up': return 'bg-purple-100 text-purple-800'
      case 'Arrived at Hospital': return 'bg-green-100 text-green-800'
      case 'Cancelled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityColor = (status: SOSRequest['status']) => {
    // Determine priority based on status
    switch (status) {
      case 'SOS Triggered': return 'bg-red-100 text-red-800 border-red-200'
      case 'Driver En Route': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'Transport Arrived': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'User Picked Up': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'Arrived at Hospital': return 'bg-green-100 text-green-800 border-green-200'
      case 'Cancelled': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: SOSRequest['status']) => {
    switch (status) {
      case 'SOS Triggered': return <AlertTriangle className="h-4 w-4" />
      case 'Driver En Route': return <Truck className="h-4 w-4" />
      case 'Transport Arrived': return <MapPin className="h-4 w-4" />
      case 'User Picked Up': return <Activity className="h-4 w-4" />
      case 'Arrived at Hospital': return <CheckCircle className="h-4 w-4" />
      case 'Cancelled': return <XCircle className="h-4 w-4" />
      default: return <Timer className="h-4 w-4" />
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hr ago`
    return date.toLocaleDateString()
  }

  // Organize SOS requests by status
  const sosRequestsByStatus = {
    all: sosRequests,
    'SOS Triggered': sosRequests.filter(sos => sos.status === 'SOS Triggered'),
    'Driver En Route': sosRequests.filter(sos => sos.status === 'Driver En Route'),
    'Transport Arrived': sosRequests.filter(sos => sos.status === 'Transport Arrived'),
    'User Picked Up': sosRequests.filter(sos => sos.status === 'User Picked Up'),
    'Arrived at Hospital': sosRequests.filter(sos => sos.status === 'Arrived at Hospital'),
    'Cancelled': sosRequests.filter(sos => sos.status === 'Cancelled')
  }

  // Filter SOS requests based on search query
  const allFilteredSOSRequests = sosRequestsByStatus[activeTab as keyof typeof sosRequestsByStatus].filter(sos =>
    sos.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sos.patient?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sos.patient?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sos.assigned_driver?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sos.patient?.address_line?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Pagination calculations
  const totalItems = allFilteredSOSRequests.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const filteredSOSRequests = allFilteredSOSRequests.slice(startIndex, endIndex)

  // Reset to first page when tab or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchQuery])

  const activeSOSRequests = sosRequests.filter(sos =>
    ['SOS Triggered', 'Driver En Route', 'Transport Arrived', 'User Picked Up'].includes(sos.status)
  )
  const completedSOSRequests = sosRequests.filter(sos => sos.status === 'Arrived at Hospital')

  // Pagination component
  const PaginationControls = () => {
    const canGoPrevious = currentPage > 1
    const canGoNext = currentPage < totalPages
    const startItem = totalItems === 0 ? 0 : startIndex + 1
    const endItem = Math.min(endIndex, totalItems)

    return (
      <div className="flex items-center justify-between px-2 py-4">
        <div className="flex items-center space-x-2">
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startItem}</span> to{' '}
            <span className="font-medium">{endItem}</span> of{' '}
            <span className="font-medium">{totalItems}</span> results
          </p>
          <Select value={itemsPerPage.toString()} onValueChange={(value) => {
            setItemsPerPage(Number(value))
            setCurrentPage(1)
          }}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-700">per page</span>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(1)}
            disabled={!canGoPrevious}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={!canGoPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNumber
              if (totalPages <= 5) {
                pageNumber = i + 1
              } else if (currentPage <= 3) {
                pageNumber = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNumber = totalPages - 4 + i
              } else {
                pageNumber = currentPage - 2 + i
              }

              return (
                <Button
                  key={pageNumber}
                  variant={currentPage === pageNumber ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(pageNumber)}
                  className="w-8 h-8 p-0"
                >
                  {pageNumber}
                </Button>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={!canGoNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={!canGoNext}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Component for rendering SOS table
  const SOSTable = ({ sosRequests }: { sosRequests: SOSRequest[] }) => (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3 font-medium">SOS ID</th>
              <th className="text-left p-3 font-medium">Patient</th>
              <th className="text-left p-3 font-medium">Contact</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Assigned Driver</th>
              <th className="text-left p-3 font-medium">Location</th>
              <th className="text-left p-3 font-medium">Requested</th>
              <th className="text-left p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sosRequests.map((sos) => (
            <tr key={sos.id} className="border-b hover:bg-gray-50">
              <td className="p-3">
                <Badge variant="outline" className="font-mono text-xs">
                  {sos.id.slice(0, 8)}...
                </Badge>
              </td>
              <td className="p-3">
                <div>
                  <div className="font-medium">{sos.patient?.full_name || 'Unknown'}</div>
                  <div className="text-sm text-gray-500">{sos.patient?.email}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {sos.patient?.blood_group && (
                      <Badge variant="outline" className="text-xs">
                        🩸 {sos.patient.blood_group}
                      </Badge>
                    )}

                  </div>
                  {sos.patient?.allergies && (
                    <div className="text-xs text-red-600 mt-1">
                      ⚠️ Allergies: {sos.patient.allergies}
                    </div>
                  )}

                </div>
              </td>
              <td className="p-3">
                <div className="text-sm space-y-1">
                  {sos.patient?.phone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[#003366] hover:text-[#002952] hover:bg-[#ccd9e6] font-medium border border-transparent hover:border-[#003366]/20"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.href = `tel:${sos.patient?.phone || ''}`
                      }}
                      title={`Call Patient: ${sos.patient.phone}`}
                    >
                      <Phone className="h-3.5 w-3.5 mr-1.5" />
                      {sos.patient.phone}
                    </Button>
                  )}
                  {sos.patient?.emergency_contacts && sos.patient.emergency_contacts.length > 0 && (
                    <div className="space-y-1">
                      {sos.patient.emergency_contacts.slice(0, 1).map((contact) => (
                        <Button
                          key={contact.id}
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[#cc3333] hover:text-[#b32d2d] hover:bg-[#f5cccc] font-medium text-xs border border-transparent hover:border-[#cc3333]/20"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.location.href = `tel:${contact.phone}`
                          }}
                          title={`Emergency: ${contact.name}${contact.relationship ? ` (${contact.relationship})` : ''}`}
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {contact.phone}
                        </Button>
                      ))}
                      {sos.patient.emergency_contacts.length > 1 && (
                        <div className="text-xs text-gray-500 pl-2">
                          +{sos.patient.emergency_contacts.length - 1} more contact{sos.patient.emergency_contacts.length > 2 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}
                  {sos.patient?.emergency_contact_phone && !sos.patient?.emergency_contacts?.length && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[#cc3333] hover:text-[#b32d2d] hover:bg-[#f5cccc] font-medium text-xs border border-transparent hover:border-[#cc3333]/20"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.href = `tel:${sos.patient?.emergency_contact_phone || ''}`
                      }}
                      title={`Call Emergency Contact: ${sos.patient.emergency_contact_phone}`}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {sos.patient.emergency_contact_phone}
                    </Button>
                  )}
                </div>
              </td>
              <td className="p-3">
                <Badge className={getStatusColor(sos.status)}>
                  {getStatusIcon(sos.status)}
                  <span className="ml-1">{sos.status}</span>
                </Badge>
              </td>
              <td className="p-3">
                {sos.assigned_driver ? (
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{sos.assigned_driver.full_name}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 font-medium border border-transparent hover:border-green-200"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.href = `tel:${sos.assigned_driver?.phone}`
                      }}
                      title={`Call Driver: ${sos.assigned_driver.phone}`}
                    >
                      <Phone className="h-3.5 w-3.5 mr-1.5" />
                      {sos.assigned_driver.phone}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async (e) => {
                      e.stopPropagation()
                      setSelectedSOS(sos)
                      // Reload available drivers when opening assign dialog
                      const driversResult = await SOSService.getAvailableDrivers()
                      if (driversResult.error) {
                        toast.error(`Failed to load available drivers: ${driversResult.error}`)
                      } else {
                        setDrivers(driversResult.data || [])
                      }
                      setAssignDialogOpen(true)
                    }}
                  >
                    <User className="h-3 w-3 mr-1" />
                    Assign
                  </Button>
                )}
              </td>
              <td className="p-3 max-w-xs">
                <div className="space-y-1">
                  {sos.patient?.address_line && (
                    <div className="flex items-start">
                      <MapPin className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                      <span className="text-sm truncate">{sos.patient.address_line}</span>
                    </div>
                  )}

                </div>
              </td>
              <td className="p-3 text-sm text-gray-500">
                {formatTimestamp(sos.requested_at)}
              </td>
              <td className="p-3">
                <div className="flex space-x-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    onClick={() => {
                      window.open(`/erteam/sos/${sos.id}`, '_blank')
                    }}
                  >
                    <Activity className="h-3 w-3 mr-1" />
                    Details
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setSelectedSOS(sos)
                      setSelectedStatus(sos.status)
                      setStatusDialogOpen(true)
                    }}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setSelectedSOS(sos)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  {sos.patient?.latitude && sos.patient?.longitude && (
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                      <MapPin className="h-3 w-3" />
                    </Button>
                  )}
                  {sos.patient?.phone && (
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                      <Phone className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <PaginationControls />
    </div>
  )

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading SOS requests...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">
                🚨 SOS Management System
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
            <p className="text-gray-600">
              Monitor and manage emergency response requests
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Badge className="bg-blue-100 text-blue-800">
              <Activity className="h-3 w-3 mr-1" />
              ERT Access Only
            </Badge>
            <Button
              variant="outline"
              onClick={async () => {
                if (patients.length === 0) {
                  toast.error('No patients available for testing')
                  return
                }

                // Select a random patient for testing
                const randomPatient = patients[Math.floor(Math.random() * patients.length)]
                try {
                  const { data, error } = await SOSService.createSOSRequest(randomPatient.user_id)
                  if (error) {
                    toast.error(`Failed to create test SOS: ${error}`)
                  } else {
                    toast.success(`Test SOS created for ${randomPatient.full_name}`)
                    await loadData()
                  }
                } catch (error) {
                  toast.error('Failed to create test SOS request')
                }
              }}
            >
              <Zap className="h-4 w-4 mr-2" />
              Test SOS
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create SOS Request
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-800">Active Requests</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-700">{activeSOSRequests.length}</div>
              <p className="text-xs text-red-600">
                Requires immediate attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SOS Triggered</CardTitle>
              <Zap className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {sosRequestsByStatus['SOS Triggered'].length}
              </div>
              <p className="text-xs text-muted-foreground">
                Awaiting assignment
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedSOSRequests.length}</div>
              <p className="text-xs text-muted-foreground">
                Successfully resolved
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{sosRequests.length}</div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                SOS Request Management
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="flex items-center space-x-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by SOS ID, patient name, email, driver, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Tabs for different SOS statuses */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-7 text-xs">
                <TabsTrigger value="all">All ({sosRequestsByStatus.all.length})</TabsTrigger>
                <TabsTrigger value="SOS Triggered">Triggered ({sosRequestsByStatus['SOS Triggered'].length})</TabsTrigger>
                <TabsTrigger value="Driver En Route">En Route ({sosRequestsByStatus['Driver En Route'].length})</TabsTrigger>
                <TabsTrigger value="Transport Arrived">Arrived ({sosRequestsByStatus['Transport Arrived'].length})</TabsTrigger>
                <TabsTrigger value="User Picked Up">Picked Up ({sosRequestsByStatus['User Picked Up'].length})</TabsTrigger>
                <TabsTrigger value="Arrived at Hospital">At Hospital ({sosRequestsByStatus['Arrived at Hospital'].length})</TabsTrigger>
                <TabsTrigger value="Cancelled">Cancelled ({sosRequestsByStatus['Cancelled'].length})</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-6">
                {allFilteredSOSRequests.length > 0 ? (
                  <SOSTable sosRequests={filteredSOSRequests} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {searchQuery ? 'No SOS requests match your search criteria.' : 'No SOS requests found.'}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="SOS Triggered" className="mt-6">
                {allFilteredSOSRequests.length > 0 ? (
                  <SOSTable sosRequests={filteredSOSRequests} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {searchQuery ? 'No triggered SOS requests match your search criteria.' : 'No triggered SOS requests at the moment.'}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="Driver En Route" className="mt-6">
                {allFilteredSOSRequests.length > 0 ? (
                  <SOSTable sosRequests={filteredSOSRequests} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {searchQuery ? 'No en-route SOS requests match your search criteria.' : 'No en-route SOS requests at the moment.'}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="Transport Arrived" className="mt-6">
                {allFilteredSOSRequests.length > 0 ? (
                  <SOSTable sosRequests={filteredSOSRequests} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {searchQuery ? 'No arrived transport SOS requests match your search criteria.' : 'No transport arrived SOS requests at the moment.'}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="User Picked Up" className="mt-6">
                {allFilteredSOSRequests.length > 0 ? (
                  <SOSTable sosRequests={filteredSOSRequests} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {searchQuery ? 'No picked up SOS requests match your search criteria.' : 'No picked up SOS requests at the moment.'}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="Arrived at Hospital" className="mt-6">
                {allFilteredSOSRequests.length > 0 ? (
                  <SOSTable sosRequests={filteredSOSRequests} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {searchQuery ? 'No hospital SOS requests match your search criteria.' : 'No hospital SOS requests at the moment.'}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="Cancelled" className="mt-6">
                {allFilteredSOSRequests.length > 0 ? (
                  <SOSTable sosRequests={filteredSOSRequests} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {searchQuery ? 'No cancelled SOS requests match your search criteria.' : 'No cancelled SOS requests found.'}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Create SOS Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New SOS Request</DialogTitle>
              <DialogDescription>
                Select a patient to create a new SOS request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Patient</label>
                <Combobox
                  options={patients.map((patient): ComboboxOption => {
                    // Create a comprehensive text representation for ComboboxOption
                    let displayText = `${patient.full_name} (${patient.email})`
                    if (patient.blood_group) displayText += ` - 🩸${patient.blood_group}`

                    return {
                      value: patient.user_id,
                      label: displayText,
                      searchText: `${patient.full_name} ${patient.email} ${patient.blood_group || ''}`
                    }
                  })}
                  value={selectedPatient}
                  onValueChange={setSelectedPatient}
                  placeholder="Choose a patient..."
                  searchPlaceholder="Search patients by name, email, blood group..."
                  emptyText="No patients found."
                />
                {patients.length === 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    No patients available. Please ensure patients are registered in the system.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSOS} className="bg-red-600 hover:bg-red-700">
                Create SOS Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Driver Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Driver</DialogTitle>
              <DialogDescription>
                Select a driver to assign to this SOS request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Driver</label>
                <Combobox
                  options={drivers.map((driver): ComboboxOption => {
                    let displayText = `${driver.full_name} (${driver.email})`
                    if (driver.phone) {
                      displayText += ` - ${driver.phone}`
                    }

                    return {
                      value: driver.id, // This should be the user_id that references public.users.id
                      label: displayText,
                      searchText: `${driver.full_name} ${driver.email} ${driver.phone || ''}`
                    }
                  })}
                  value={selectedDriver}
                  onValueChange={setSelectedDriver}
                  placeholder="Choose a driver..."
                  searchPlaceholder="Search drivers by name, email, or phone..."
                  emptyText="No drivers found."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssignDriver}>
                Assign Driver
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Update Status Dialog */}
        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update SOS Status</DialogTitle>
              <DialogDescription>
                Change the status of this SOS request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Status</label>
                <Combobox
                  options={[
                    { value: "SOS Triggered", label: "SOS Triggered" },
                    { value: "Driver En Route", label: "Driver En Route" },
                    { value: "Transport Arrived", label: "Transport Arrived" },
                    { value: "User Picked Up", label: "User Picked Up" },
                    { value: "Arrived at Hospital", label: "Arrived at Hospital" },
                    { value: "Cancelled", label: "Cancelled" }
                  ]}
                  value={selectedStatus}
                  onValueChange={(value) => setSelectedStatus(value as SOSRequest['status'])}
                  placeholder="Select status..."
                  searchPlaceholder="Search status..."
                  emptyText="No status found."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateStatus}>
                Update Status
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Delete SOS Request
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this SOS request? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {selectedSOS && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm">
                  <div><strong>ID:</strong> {selectedSOS.id.slice(0, 8)}...</div>
                  <div><strong>Patient:</strong> {selectedSOS.patient?.full_name || 'Unknown'}</div>
                  <div><strong>Status:</strong> {selectedSOS.status}</div>
                  <div><strong>Requested:</strong> {formatTimestamp(selectedSOS.requested_at)}</div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteSOS}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete SOS Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}
