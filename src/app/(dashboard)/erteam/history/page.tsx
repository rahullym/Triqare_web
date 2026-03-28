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
  History,
  Calendar,
  Clock,
  MapPin,
  User,
  Truck,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Download,
  Filter,
  RefreshCw,
  Loader2
} from 'lucide-react'
import { SOSService, SOSRequest } from '@/services/sosService'
import { toast } from 'sonner'
import { exportToCSV, exportToPDF } from '@/lib/exportUtils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileText, FileSpreadsheet } from 'lucide-react'

export default function ERTHistoryPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'Arrived at Hospital' | 'Cancelled'>('all')
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'quarter' | 'all'>('month')

  const [sosHistory, setSOSHistory] = useState<SOSRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  // Fetch historical SOS requests
  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const filters: any = {
        dateRange,
        search: searchTerm || undefined,
        limit: 100,
        offset: 0
      }

      if (statusFilter !== 'all') {
        filters.status = statusFilter
      }

      const { data, error: fetchError, total } = await SOSService.getHistoricalSOSRequests(filters)

      if (fetchError) {
        setError(fetchError)
        toast.error('Failed to load history')
      } else {
        setSOSHistory(data || [])
        setTotalCount(total || 0)
      }
    } catch (err) {
      console.error('Error fetching history:', err)
      setError('Failed to connect to server')
      toast.error('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, statusFilter, dateRange])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Arrived at Hospital':
        return 'bg-green-100 text-green-800'
      case 'Cancelled':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Arrived at Hospital':
        return <CheckCircle className="h-4 w-4" />
      case 'Cancelled':
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  // Calculate statistics
  const completedCases = sosHistory.filter(h => h.status === 'Arrived at Hospital').length
  const cancelledCases = sosHistory.filter(h => h.status === 'Cancelled').length
  const totalCases = sosHistory.length
  const successRate = totalCases > 0 ? Math.round((completedCases / totalCases) * 100) : 0

  // Calculate average response time
  const calculateAvgResponseTime = () => {
    const completedWithTimes = sosHistory.filter(h =>
      h.status === 'Arrived at Hospital' && h.requested_at && h.assigned_at
    )

    if (completedWithTimes.length === 0) return 'N/A'

    const totalMinutes = completedWithTimes.reduce((sum, sos) => {
      const requested = new Date(sos.requested_at).getTime()
      const assigned = new Date(sos.assigned_at!).getTime()
      return sum + (assigned - requested) / 60000 // Convert to minutes
    }, 0)

    const avgMinutes = Math.round(totalMinutes / completedWithTimes.length)
    return `${avgMinutes} min`
  }

  const avgResponseTime = calculateAvgResponseTime()

  // Format duration between two dates
  const formatDuration = (start: string, end: string | null | undefined) => {
    if (!end) return 'N/A'
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const diffMs = endTime - startTime
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) return `${diffMins} min`
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return `${hours} hr ${mins} min`
  }

  // Navigation handlers
  const handleViewDetails = (sosId: string) => {
    router.push(`/erteam/sos/${sosId}`)
  }

  // Export handlers
  const handleExportCSV = () => {
    try {
      if (sosHistory.length === 0) {
        toast.error('No data to export')
        return
      }

      const dateRangeLabel = dateRange === 'all' ? 'all-time' : dateRange
      const statusLabel = statusFilter === 'all' ? 'all' : statusFilter.toLowerCase().replace(/ /g, '-')
      const filename = `sos-history-${dateRangeLabel}-${statusLabel}-${new Date().toISOString().split('T')[0]}.csv`

      exportToCSV(sosHistory, filename)
      toast.success(`Exported ${sosHistory.length} records to CSV`)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export CSV')
    }
  }

  const handleExportPDF = async () => {
    try {
      if (sosHistory.length === 0) {
        toast.error('No data to export')
        return
      }

      const filename = `sos-history-${new Date().toISOString().split('T')[0]}.pdf`
      await exportToPDF(sosHistory, filename)
      toast.success('Opening PDF preview...')
    } catch (error) {
      console.error('Export error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to export PDF')
    }
  }

  // Loading state
  if (loading && sosHistory.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <History className="h-6 w-6 mr-2" />
            Emergency Response History
          </h1>
          <p className="text-gray-600">Review past emergency responses and outcomes</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          <span className="ml-2 text-gray-600">Loading history...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <History className="h-6 w-6 mr-2" />
            Emergency Response History
          </h1>
          <p className="text-gray-600">Review past emergency responses and outcomes</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={fetchHistory} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={sosHistory.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cases</p>
                <p className="text-2xl font-bold text-gray-900">{totalCases}</p>
              </div>
              <History className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedCases}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Response</p>
                <p className="text-2xl font-bold text-blue-600">{avgResponseTime}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-purple-600">{successRate}%</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-purple-600" />
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
                  placeholder="Search by case ID, patient name, location, or driver..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Arrived at Hospital">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last Week</SelectItem>
                  <SelectItem value="month">Last Month</SelectItem>
                  <SelectItem value="quarter">Last Quarter</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History List */}
      <div className="space-y-4">
        {sosHistory.map((sos) => (
          <Card key={sos.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center space-x-3 flex-wrap gap-2">
                    <Badge className={getStatusColor(sos.status)}>
                      {getStatusIcon(sos.status)}
                      <span className="ml-1">{sos.status}</span>
                    </Badge>
                    <span className="text-sm text-gray-500 font-mono">ID: {sos.id.slice(0, 8)}</span>
                    {sos.auto_assigned && (
                      <Badge variant="outline" className="text-xs">Auto-assigned</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {sos.patient?.full_name || 'Unknown Patient'}
                      </h3>
                      <p className="text-sm text-gray-600 flex items-center mt-1">
                        <MapPin className="h-4 w-4 mr-1" />
                        {sos.patient?.address_line || 'Location not specified'}
                      </p>
                      <p className="text-sm text-gray-600 flex items-center mt-1">
                        <Calendar className="h-4 w-4 mr-1" />
                        {new Date(sos.requested_at).toLocaleString()}
                      </p>
                      {sos.patient?.phone && (
                        <p className="text-sm text-gray-600 mt-1">
                          📞 {sos.patient.phone}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2" />
                          <strong>Response Time:</strong> {formatDuration(sos.requested_at, sos.assigned_at)}
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2" />
                          <strong>Total Duration:</strong> {formatDuration(sos.requested_at, sos.completed_at)}
                        </div>
                        {sos.patient?.blood_group && (
                          <div className="flex items-center">
                            <strong>Blood Group:</strong> <span className="ml-1">{sos.patient.blood_group}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="space-y-1 text-sm text-gray-600">
                        {sos.assigned_driver ? (
                          <>
                            <div className="flex items-center">
                              <User className="h-4 w-4 mr-2" />
                              <strong>Driver:</strong> {sos.assigned_driver.full_name}
                            </div>
                            {sos.assigned_driver.phone && (
                              <div className="flex items-center">
                                📞 {sos.assigned_driver.phone}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center text-gray-400">
                            <User className="h-4 w-4 mr-2" />
                            <span>No driver assigned</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {(sos.patient?.allergies || sos.patient?.emergency_contact_name) && (
                    <div className="pt-3 border-t">
                      {sos.patient.allergies && (
                        <p className="text-sm text-gray-600">
                          <strong>Allergies:</strong> {sos.patient.allergies}
                        </p>
                      )}
                      {sos.patient.emergency_contact_name && (
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Emergency Contact:</strong> {sos.patient.emergency_contact_name}
                          {sos.patient.emergency_contact_phone && ` - ${sos.patient.emergency_contact_phone}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex space-x-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDetails(sos.id)}
                    title="View Details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sosHistory.length === 0 && !loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-gray-500">
              <History className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No emergency history found</h3>
              <p>Try adjusting your search criteria or filters.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
