'use client'

import React, { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertTriangle,
  UserCheck,
  Truck,
  UserPlus,
  Building2,
  CheckCircle,
  XCircle,
  TimerOff
} from 'lucide-react'
import SOSRequestsDataTable from './SOSRequestsDataTable'


interface SOSRequest {
  id: string
  patient_id: string
  patient_name: string
  patient_email: string
  patient_phone: string
  patient_details: {
    blood_group?: string
    allergies?: string
    emergency_contact_name?: string
    emergency_contact_phone?: string
    address_line?: string
    emergency_contacts: Array<{
      id: string
      patient_id: string
      name: string
      phone: string
      relationship?: string
      created_at: string
      updated_at: string
    }>
  }
  assigned_driver?: {
    id: string
    name: string
    email: string
    phone: string
  } | null
  requested_at: string
  assigned_at?: string | null
  completed_at?: string | null
  auto_assigned: boolean
  status: string
}

interface SOSRequestsTabsProps {
  onView: (request: SOSRequest) => void
  onEdit: (request: SOSRequest) => void
  onDelete: (request: SOSRequest) => void
  onAssignDriver: (request: SOSRequest) => void
  refreshTrigger: number
}

const statusConfig = [
  {
    value: 'SOS Triggered',
    label: 'SOS Triggered',
    icon: AlertTriangle,
    color: 'bg-red-100 text-red-800',
    description: 'New emergency requests awaiting response'
  },
  {
    value: 'Driver En Route',
    label: 'En Route',
    icon: Truck,
    color: 'bg-blue-100 text-blue-800',
    description: 'Driver en route to patient location'
  },
  {
    value: 'Transport Arrived',
    label: 'Transport Arrived',
    icon: UserCheck,
    color: 'bg-yellow-100 text-yellow-800',
    description: 'Ambulance arrived at patient location'
  },
  {
    value: 'User Picked Up',
    label: 'User Picked Up',
    icon: UserPlus,
    color: 'bg-purple-100 text-purple-800',
    description: 'Patient picked up, heading to hospital'
  },
  {
    value: 'Arrived at Hospital',
    label: 'Arrived at Hospital',
    icon: Building2,
    color: 'bg-green-100 text-green-800',
    description: 'Patient safely delivered to hospital'
  },
  {
    value: 'Cancelled',
    label: 'Cancelled',
    icon: XCircle,
    color: 'bg-gray-100 text-gray-800',
    description: 'Request cancelled or resolved without transport'
  },
  {
    value: 'Timed Out',
    label: 'Timed Out',
    icon: TimerOff,
    // Amber, not the gray of a cancel: this is the one terminal outcome that means
    // the system FAILED to help someone, and it should not blend into the noise.
    color: 'bg-amber-100 text-amber-800',
    description: 'Expired with no driver found — nobody was dispatched'
  }
]

export default function SOSRequestsTabs({
  onView,
  onEdit,
  onDelete,
  onAssignDriver,
  refreshTrigger
}: SOSRequestsTabsProps) {
  const [activeTab, setActiveTab] = useState('SOS Triggered')
  // TODO: Implement status counts hook
  const statusCounts: Record<string, number> = {}
  const countsLoading = false

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-auto p-1">
          {statusConfig.map((status) => {
            const Icon = status.icon
            return (
              <TabsTrigger
                key={status.value}
                value={status.value}
                className="flex flex-col items-center p-3 space-y-1 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <div className="flex items-center space-x-1">
                  <Icon className="h-4 w-4" />
                  {!countsLoading && statusCounts[status.value] !== undefined && (
                    <Badge variant="secondary" className="text-xs px-1 py-0 min-w-[20px] h-5">
                      {statusCounts[status.value]}
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-medium">{status.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {statusConfig.map((status) => {
          const Icon = status.icon
          return (
            <TabsContent key={status.value} value={status.value} className="mt-6">
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${status.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">{status.label}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">
                          {status.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={status.color}>
                        {status.label}
                      </Badge>
                      {!countsLoading && statusCounts[status.value] !== undefined && (
                        <Badge variant="outline" className="text-sm">
                          {statusCounts[status.value]} {statusCounts[status.value] === 1 ? 'request' : 'requests'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <SOSRequestsDataTable
                    statusFilter={status.value}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onAssignDriver={onAssignDriver}
                    refreshTrigger={refreshTrigger}
                    showStatusColumn={false}
                    initialPageSize={15}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
