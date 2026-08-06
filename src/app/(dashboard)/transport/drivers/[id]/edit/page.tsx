'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Users, 
  ArrowLeft, 
  Save, 
  Loader2,
  User,
  Car,
  MapPin,
  Phone,
  Mail,
  FileText,
  Calendar,
  Shield
} from 'lucide-react'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { toast } from 'sonner'
import Link from 'next/link'

interface Driver {
  user_id: string
  transport_company_id: string
  license_number: string
  aadhar_number?: string | null
  license_class?: string | null
  license_expiry?: string | null
  medical_cert_expiry?: string | null
  years_experience: number
  special_certifications?: string | null
  languages_spoken?: string | null
  vehicle_assigned?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relationship?: string | null
  address_line?: string | null
  country_id?: string | null
  state_id?: string | null
  city_id?: string | null
  pincode_id?: string | null
  preferred_shift: 'morning' | 'afternoon' | 'night' | 'flexible'
  max_distance_km: number
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  is_verified: boolean
  user?: {
    id: string
    full_name: string
    first_name?: string
    last_name?: string
    email: string
    phone: string
  }
  created_by_user?: {
    id: string
    full_name: string
    email: string
  }
}

interface FormData {
  // User Information
  full_name: string
  email: string
  phone: string
  first_name: string
  last_name: string
  
  // Driver Information
  license_number: string
  aadhar_number: string
  license_class: string
  license_expiry: string
  medical_cert_expiry: string
  years_experience: number
  special_certifications: string
  languages_spoken: string
  vehicle_assigned: string
  
  // Contact Information
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
  
  // Location Information
  address_line: string
  country_id: string
  state_id: string
  city_id: string
  pincode_id: string
  
  // Preferences
  preferred_shift: 'morning' | 'afternoon' | 'night' | 'flexible'
  max_distance_km: number
  
  // Status
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  is_verified: boolean
}

interface FormErrors {
  [key: string]: string
}

export default function EditDriverPage() {
  const router = useRouter()
  const params = useParams()
  const driverId = params.id as string
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [formData, setFormData] = useState<FormData>({
    // User Information
    full_name: '',
    email: '',
    phone: '',
    first_name: '',
    last_name: '',
    
    // Driver Information
    license_number: '',
    aadhar_number: '',
    license_class: '',
    license_expiry: '',
    medical_cert_expiry: '',
    years_experience: 0,
    special_certifications: '',
    languages_spoken: '',
    vehicle_assigned: '',
    
    // Contact Information
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    
    // Location Information
    address_line: '',
    country_id: '',
    state_id: '',
    city_id: '',
    pincode_id: '',
    
    // Preferences
    preferred_shift: 'flexible',
    max_distance_km: 50,
    
    // Status
    status: 'available',
    is_verified: false
  })
  const [errors, setErrors] = useState<FormErrors>({})

  useEffect(() => {
    fetchDriver()
  }, [driverId])

  const fetchDriver = async () => {
    try {
      setIsLoading(true)
      // ?test=true asked the API to act as the hard-coded transport.test@example.com
      // account. The route ignores it in production, but in development it read and
      // wrote another company's driver — so the flag only ever hid bugs.
      const response = await fetch(`/api/transport/drivers/${driverId}`)

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          const driverData = data.data
          setDriver(driverData)
          
          // Populate form with existing data
          setFormData({
            // User Information
            full_name: driverData.user?.full_name || '',
            email: driverData.user?.email || '',
            phone: driverData.user?.phone || '',
            first_name: driverData.user?.first_name || '',
            last_name: driverData.user?.last_name || '',
            
            // Driver Information
            license_number: driverData.license_number || '',
            aadhar_number: driverData.aadhar_number || '',
            license_class: driverData.license_class || '',
            license_expiry: driverData.license_expiry || '',
            medical_cert_expiry: driverData.medical_cert_expiry || '',
            years_experience: driverData.years_experience || 0,
            special_certifications: driverData.special_certifications || '',
            languages_spoken: driverData.languages_spoken || '',
            vehicle_assigned: driverData.vehicle_assigned || '',
            
            // Contact Information
            emergency_contact_name: driverData.emergency_contact_name || '',
            emergency_contact_phone: driverData.emergency_contact_phone || '',
            emergency_contact_relationship: driverData.emergency_contact_relationship || '',
            
            // Location Information
            address_line: driverData.address_line || '',
            country_id: driverData.country_id || '',
            state_id: driverData.state_id || '',
            city_id: driverData.city_id || '',
            pincode_id: driverData.pincode_id || '',
            
            // Preferences
            preferred_shift: driverData.preferred_shift || 'flexible',
            max_distance_km: driverData.max_distance_km || 50,
            
            // Status
            status: driverData.status || 'available',
            is_verified: driverData.is_verified || false
          })
        } else {
          throw new Error(data.error || 'Failed to fetch driver')
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch driver')
      }
    } catch (error) {
      console.error('Error fetching driver:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to fetch driver')
      router.push('/transport/drivers')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Required fields validation
    if (!formData.full_name.trim()) newErrors.full_name = 'Full name is required'
    if (!formData.email.trim()) newErrors.email = 'Email is required'
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required'
    if (!formData.license_number.trim()) newErrors.license_number = 'License number is required'

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (formData.email && !emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    // Phone validation
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
    if (formData.phone && !phoneRegex.test(formData.phone.replace(/[\s\-\(\)]/g, ''))) {
      newErrors.phone = 'Please enter a valid phone number'
    }

    // License number validation
    if (formData.license_number && formData.license_number.length < 5) {
      newErrors.license_number = 'License number must be at least 5 characters'
    }

    // Years of experience validation
    if (formData.years_experience < 0 || formData.years_experience > 50) {
      newErrors.years_experience = 'Years of experience must be between 0 and 50'
    }

    // Max distance validation
    if (formData.max_distance_km < 1 || formData.max_distance_km > 500) {
      newErrors.max_distance_km = 'Max distance must be between 1 and 500 km'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      toast.error('Please fix the errors in the form')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/transport/drivers/${driverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast.success('Driver updated successfully!')
          router.push('/transport/drivers')
        } else {
          throw new Error(data.error || 'Failed to update driver')
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update driver')
      }
    } catch (error) {
      console.error('Error updating driver:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update driver')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={['transport_company']}>
        <div className="container mx-auto py-6 px-4">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading driver information...</span>
            </div>
          </div>
        </div>
      </RoleGuard>
    )
  }

  if (!driver) {
    return (
      <RoleGuard allowedRoles={['transport_company']}>
        <div className="container mx-auto py-6 px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Driver Not Found</h1>
            <p className="text-gray-600 mb-6">The driver you're looking for doesn't exist or you don't have permission to edit it.</p>
            <Link href="/transport/drivers">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Drivers
              </Button>
            </Link>
          </div>
        </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['transport_company']}>
      <div className="container mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/transport/drivers">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Drivers
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Edit Driver</h1>
              <p className="text-gray-600">Update driver information for {driver.user?.full_name}</p>
              {driver.created_by_user && (
                <p className="text-sm text-gray-500">
                  Created by: {driver.created_by_user.full_name} ({driver.created_by_user.email})
                </p>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">
                    Full Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => handleInputChange('full_name', e.target.value)}
                    placeholder="Enter full name"
                    className={errors.full_name ? 'border-red-500' : ''}
                  />
                  {errors.full_name && (
                    <p className="text-sm text-red-500">{errors.full_name}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">
                      First Name
                    </Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => handleInputChange('first_name', e.target.value)}
                      placeholder="Enter first name"
                      className={errors.first_name ? 'border-red-500' : ''}
                    />
                    {errors.first_name && (
                      <p className="text-sm text-red-500">{errors.first_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">
                      Last Name
                    </Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => handleInputChange('last_name', e.target.value)}
                      placeholder="Enter last name"
                      className={errors.last_name ? 'border-red-500' : ''}
                    />
                    {errors.last_name && (
                      <p className="text-sm text-red-500">{errors.last_name}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="Enter email address"
                        className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-sm text-red-500">{errors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      Phone Number <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="Enter phone number"
                        className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-sm text-red-500">{errors.phone}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Driver License Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  License Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="license_number">
                    License Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="license_number"
                    value={formData.license_number}
                    onChange={(e) => handleInputChange('license_number', e.target.value)}
                    placeholder="Enter license number"
                    className={errors.license_number ? 'border-red-500' : ''}
                  />
                  {errors.license_number && (
                    <p className="text-sm text-red-500">{errors.license_number}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="license_class">License Class</Label>
                    <Select value={formData.license_class} onValueChange={(value) => handleInputChange('license_class', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select license class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="class-a">Class A</SelectItem>
                        <SelectItem value="class-b">Class B</SelectItem>
                        <SelectItem value="class-c">Class C</SelectItem>
                        <SelectItem value="cdl">CDL</SelectItem>
                        <SelectItem value="motorcycle">Motorcycle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="years_experience">Years of Experience</Label>
                    <Input
                      id="years_experience"
                      type="number"
                      min="0"
                      max="50"
                      value={formData.years_experience}
                      onChange={(e) => handleInputChange('years_experience', parseInt(e.target.value) || 0)}
                      placeholder="Enter years of experience"
                      className={errors.years_experience ? 'border-red-500' : ''}
                    />
                    {errors.years_experience && (
                      <p className="text-sm text-red-500">{errors.years_experience}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value as any)}>
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

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_verified"
                    checked={formData.is_verified}
                    onCheckedChange={(checked) => handleInputChange('is_verified', checked as boolean)}
                  />
                  <Label htmlFor="is_verified">Driver is verified</Label>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Link href="/transport/drivers">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating Driver...
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
      </div>
    </RoleGuard>
  )
}
