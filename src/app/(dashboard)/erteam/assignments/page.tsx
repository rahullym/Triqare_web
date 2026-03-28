'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  Filter,
  MapPin,
  Clock,
  User,
  Truck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Phone,
  RefreshCw,
  Loader2,
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
import { toast } from 'sonner'

interface Assignment {
  id: string
  caseId: string
  priority: 'high' | 'medium' | 'low'
  status: string
  patientName: string
  patientEmail: string
  patientPhone: string
  location: string
  latitude: number | null
  longitude: number | null
  bloodGroup: string | null
  allergies: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  assignedDriver: string | null
  driverPhone: string | null
  driverEmail: string | null
  vehicleNumber: string | null
  licenseNumber: string | null
  companyName: string | null
  requestedAt: string
  assignedAt: string | null
  completedAt: string | null
  autoAssigned: boolean
}

interface Stats {
  total: number
  active: number
  highPriority: number
  completed: number
  cancelled: number
}

export default function AssignmentsPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, highPriority: 0, completed: 0, cancelled: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)

      const response = await fetch(`/api/erteam/assignments?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setAssignments(result.data)
        setStats(result.stats)
      } else {
        setError(result.error || 'Failed to fetch assignments')
        toast.error('Failed to load assignments')
      }
    } catch (err) {
      console.error('Error fetching assignments:', err)
      setError('Failed to connect to server')
      toast.error('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, statusFilter, priorityFilter])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAssignments, 30000)
    return () => clearInterval(interval)
  }, [fetchAssignments])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SOS Triggered':
        return 'bg-red-100 text-red-800'
      case 'Driver Assigned':
        return 'bg-blue-100 text-blue-800'
      case 'Driver En Route':
        return 'bg-orange-100 text-orange-800'
      case 'Patient Picked Up':
        return 'bg-purple-100 text-purple-800'
      case 'At Hospital':
        return 'bg-indigo-100 text-indigo-800'
      case 'Completed':
        return 'bg-green-100 text-green-800'
      case 'Cancelled':
        return 'bg-gray-100 text-gray-800'
      case 'Transferred':
        return 'bg-cyan-100 text-cyan-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SOS Triggered':
        return <AlertTriangle className="h-4 w-4" />
      case 'Driver Assigned':
        return <User className="h-4 w-4" />
      case 'Driver En Route':
        return <Truck className="h-4 w-4" />
      case 'Patient Picked Up':
        return <User className="h-4 w-4" />
      case 'At Hospital':
        return <MapPin className="h-4 w-4" />
      case 'Completed':
        return <CheckCircle className="h-4 w-4" />
      case 'Cancelled':
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString()
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  // Navigation handlers
  const handleViewDetails = (assignmentId: string) => {
    router.push(`/erteam/sos/${assignmentId}`)
  }

  const handleEditAssignment = (assignmentId: string) => {
    router.push(`/erteam/sos/${assignmentId}/edit`)
  }

  const handleViewOnMap = (assignment: Assignment) => {
    if (assignment.latitude && assignment.longitude) {
      router.push(`/erteam/map?lat=${assignment.latitude}&lng=${assignment.longitude}&highlight=${assignment.id}`)
    } else {
      toast.error('Location coordinates not available')
    }
  }

  // Loading state
  if (loading && assignments.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emergency Assignments</h1>
          <p className="text-gray-600">Monitor and manage emergency response assignments</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          <span className="ml-2 text-gray-600">Loading assignments...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error && assignments.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emergency Assignments</h1>
          <p className="text-gray-600">Monitor and manage emergency response assignments</p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-red-500">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Error Loading Assignments</h3>
              <p className="mb-4">{error}</p>
              <Button onClick={fetchAssignments} variant="outline">
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
            <h1 className="text-2xl font-bold text-gray-900">Emergency Assignments</h1>
            <p className="text-gray-600">Monitor and manage emergency response assignments</p>
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
            <Button onClick={fetchAssignments} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
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
                  <p className="text-sm font-medium text-gray-600">Active Assignments</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
                </div>
                <Truck className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">High Priority</p>
                  <p className="text-2xl font-bold text-red-600">{stats.highPriority}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Assignments</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <User className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search by patient name, case ID, or location..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="SOS Triggered">SOS Triggered</SelectItem>
                    <SelectItem value="Driver Assigned">Driver Assigned</SelectItem>
                    <SelectItem value="Driver En Route">Driver En Route</SelectItem>
                    <SelectItem value="Patient Picked Up">Patient Picked Up</SelectItem>
                    <SelectItem value="At Hospital">At Hospital</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assignments Display - Grid or List View */}
        {viewMode === 'grid' ? (
          // Grid View (Card-based)
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center space-x-3 flex-wrap gap-2">
                        <Badge className={getPriorityColor(assignment.priority)}>
                          {assignment.priority.toUpperCase()}
                        </Badge>
                        <Badge className={getStatusColor(assignment.status)}>
                          {getStatusIcon(assignment.status)}
                          <span className="ml-1">{assignment.status}</span>
                        </Badge>
                        <span className="text-sm text-gray-500">Case: {assignment.caseId}</span>
                        <span className="text-xs text-gray-400">{getTimeAgo(assignment.requestedAt)}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <h3 className="font-semibold text-gray-900">{assignment.patientName}</h3>
                          <p className="text-sm text-gray-600 flex items-center">
                            <MapPin className="h-4 w-4 mr-1" />
                            {assignment.location || 'Location not specified'}
                          </p>
                          <p className="text-sm text-gray-600 flex items-center">
                            <Phone className="h-4 w-4 mr-1" />
                            {assignment.patientPhone || assignment.emergencyContactPhone || 'No phone'}
                          </p>
                          {assignment.bloodGroup && (
                            <p className="text-sm text-gray-600">
                              <strong>Blood Group:</strong> {assignment.bloodGroup}
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">
                            <strong>Driver:</strong> {assignment.assignedDriver || 'Not assigned'}
                          </p>
                          {assignment.vehicleNumber && (
                            <p className="text-sm text-gray-600">
                              <strong>Vehicle:</strong> {assignment.vehicleNumber}
                            </p>
                          )}
                          {assignment.companyName && (
                            <p className="text-sm text-gray-600">
                              <strong>Company:</strong> {assignment.companyName}
                            </p>
                          )}
                          <p className="text-sm text-gray-600">
                            <strong>Requested:</strong> {formatDateTime(assignment.requestedAt)}
                          </p>
                        </div>

                        <div>
                          {assignment.assignedAt && (
                            <p className="text-sm text-gray-600">
                              <strong>Assigned:</strong> {formatDateTime(assignment.assignedAt)}
                            </p>
                          )}
                          {assignment.completedAt && (
                            <p className="text-sm text-gray-600">
                              <strong>Completed:</strong> {formatDateTime(assignment.completedAt)}
                            </p>
                          )}
                          {assignment.emergencyContactName && (
                            <p className="text-sm text-gray-600">
                              <strong>Emergency Contact:</strong> {assignment.emergencyContactName}
                            </p>
                          )}
                          {assignment.autoAssigned && (
                            <Badge variant="outline" className="mt-1">Auto-assigned</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        title="View Details"
                        onClick={() => handleViewDetails(assignment.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Edit"
                        onClick={() => handleEditAssignment(assignment.id)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {assignment.latitude && assignment.longitude && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="View on Map"
                          onClick={() => handleViewOnMap(assignment)}
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          // List View (Table-based)
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-mono text-sm">{assignment.caseId}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{assignment.patientName}</p>
                          <p className="text-xs text-gray-500">{assignment.patientPhone || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(assignment.status)}>
                          {getStatusIcon(assignment.status)}
                          <span className="ml-1">{assignment.status}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(assignment.priority)}>
                          {assignment.priority.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{assignment.assignedDriver || 'Not assigned'}</p>
                          {assignment.vehicleNumber && (
                            <p className="text-xs text-gray-500">{assignment.vehicleNumber}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm max-w-[150px] truncate block" title={assignment.location}>
                          {assignment.location || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">{getTimeAgo(assignment.requestedAt)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View Details"
                            onClick={() => handleViewDetails(assignment.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit"
                            onClick={() => handleEditAssignment(assignment.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {assignments.length === 0 && !loading && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-gray-500">
                <Search className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No assignments found</h3>
                <p>There are no SOS requests in the system yet, or try adjusting your filters.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  )
}
