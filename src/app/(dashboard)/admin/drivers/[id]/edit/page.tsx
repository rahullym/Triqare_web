'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Users,
  ArrowLeft,
  Save,
  Phone,
  Mail,
  Building2,
  Truck
} from 'lucide-react'

interface FormData {
  full_name: string
  phone_number: string
  email: string
  license_number: string
  aadhar_number: string
  is_verified: boolean
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
}

interface Driver {
  id: string
  transport_company_id: string
  transport_company_name: string
  transport_company_registration: string
  full_name: string
  phone_number: string
  email: string
  license_number: string
  aadhar_number: string
  is_verified: boolean
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
}



export default function EditDriverPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    phone_number: '',
    email: '',
    license_number: '',
    aadhar_number: '',
    is_verified: false,
    status: 'available'
  })
  const [errors, setErrors] = useState<Partial<FormData>>({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        const driverId = resolvedParams.id

        // Fetch driver data from API
        const response = await fetch(`/api/drivers/${driverId}`)
        const data = await response.json()

        if (data.success && data.driver) {
          // Transform API data to match component interface
          const transformedDriver: Driver = {
            id: data.driver.user_id,
            transport_company_id: data.driver.transport_company_id,
            transport_company_name: data.driver.transport_company?.company_name || 'No company assigned',
            transport_company_registration: data.driver.transport_company?.registration_number || 'N/A',
            full_name: data.driver.user?.full_name || 'Unknown Driver',
            phone_number: data.driver.user?.phone || 'No phone provided',
            email: data.driver.user?.email || 'No email provided',
            license_number: data.driver.license_number || 'No license number',
            aadhar_number: data.driver.aadhar_number || '',
            is_verified: data.driver.is_verified || false,
            status: data.driver.status || 'available'
          }

          setDriver(transformedDriver)
          setFormData({
            full_name: transformedDriver.full_name,
            phone_number: transformedDriver.phone_number,
            email: transformedDriver.email,
            license_number: transformedDriver.license_number,
            aadhar_number: transformedDriver.aadhar_number,
            is_verified: transformedDriver.is_verified,
            status: transformedDriver.status
          })
        } else {
          console.error('Failed to fetch driver data:', data.error)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setIsLoadingData(false)
      }
    }

    fetchData()
  }, [resolvedParams.id])

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {}

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    }

    if (!formData.phone_number.trim()) {
      newErrors.phone_number = 'Phone number is required'
    } else if (!/^\+?[\d\s\-\(\)]+$/.test(formData.phone_number)) {
      newErrors.phone_number = 'Please enter a valid phone number'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.license_number.trim()) {
      newErrors.license_number = 'License number is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/drivers/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          license_number: formData.license_number,
          aadhar_number: formData.aadhar_number,
          is_verified: formData.is_verified,
          status: formData.status
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update driver')
      }

      // Redirect to driver view page
      router.push(`/admin/drivers/${resolvedParams.id}`)
    } catch (error) {
      console.error('Error updating driver:', error)
      // Handle error (show toast, etc.)
      alert(error instanceof Error ? error.message : 'Failed to update driver')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoadingData) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!driver) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Driver not found</h3>
              <Button onClick={() => router.push('/admin/drivers')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Drivers
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
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Edit Driver
          </h1>
          <p className="text-gray-600">
            Update {driver.full_name}'s information and settings
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        {/* Company Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Transport Company
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{driver.transport_company_name}</p>
                <p className="text-sm text-gray-600 font-mono">{driver.transport_company_registration}</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`/admin/transport-companies/${driver.transport_company_id}`}>
                  View Company
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Driver Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="Enter driver's full name"
                  className={errors.full_name ? 'border-red-500' : ''}
                />
                {errors.full_name && (
                  <p className="text-sm text-red-500">{errors.full_name}</p>
                )}
              </div>

              {/* License Number */}
              <div className="space-y-2">
                <Label htmlFor="license_number">
                  License Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="license_number"
                  value={formData.license_number}
                  onChange={(e) => handleInputChange('license_number', e.target.value)}
                  placeholder="DL-12345"
                  className={errors.license_number ? 'border-red-500' : ''}
                />
                {errors.license_number && (
                  <p className="text-sm text-red-500">{errors.license_number}</p>
                )}
              </div>

              {/* Aadhar Number */}
              <div className="space-y-2">
                <Label htmlFor="aadhar_number">
                  Aadhar Number
                </Label>
                <Input
                  id="aadhar_number"
                  value={formData.aadhar_number}
                  onChange={(e) => handleInputChange('aadhar_number', e.target.value)}
                  placeholder="123456789012"
                  maxLength={12}
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="driver@company.com"
                    className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="phone_number">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="phone_number"
                    value={formData.phone_number}
                    onChange={(e) => handleInputChange('phone_number', e.target.value)}
                    placeholder="+1-555-0123"
                    className={`pl-10 ${errors.phone_number ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.phone_number && (
                  <p className="text-sm text-red-500">{errors.phone_number}</p>
                )}
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">
                  Status <span className="text-red-500">*</span>
                </Label>
                <Select value={formData.status} onValueChange={(value: 'available' | 'assigned' | 'on_trip' | 'inactive') => handleInputChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="on_trip">On Trip</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Verification Status */}
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="is_verified"
                  checked={formData.is_verified}
                  onCheckedChange={(checked) => handleInputChange('is_verified', checked as boolean)}
                />
                <Label htmlFor="is_verified" className="cursor-pointer">
                  Driver is verified
                </Label>
              </div>





              {/* Form Actions */}
              <div className="flex items-center justify-end gap-4 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Update Driver
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Status Change Warning */}
        {formData.status === 'on_trip' && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">i</span>
                </div>
                <div>
                  <h3 className="font-medium text-blue-900 mb-1">On Trip Status</h3>
                  <p className="text-sm text-blue-800">
                    This driver is currently on a trip. They will not receive new assignments until the trip is completed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {formData.status === 'assigned' && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <div>
                  <h3 className="font-medium text-yellow-900 mb-1">Assigned Status</h3>
                  <p className="text-sm text-yellow-800">
                    This driver is currently assigned to an emergency. They will not receive new assignments until the current one is completed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {formData.status === 'inactive' && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <div>
                  <h3 className="font-medium text-orange-900 mb-1">Status Change Warning</h3>
                  <p className="text-sm text-orange-800">
                    Setting this driver to inactive will prevent them from receiving new assignments. 
                    Existing assignments will remain active until completed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
