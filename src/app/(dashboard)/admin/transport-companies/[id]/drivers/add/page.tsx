'use client'

/**
 * Add a driver to a specific transport company.
 *
 * WHAT WAS WRONG. This screen — reachable from three places on the company pages
 * — never created anything. It rendered a hard-coded "Metro Emergency Transport
 * (TC-2024-001)" header whatever company you opened, and Create Driver did
 * `console.log`, waited a second, then redirected to the company's driver list as
 * though it had worked. The list, of course, was unchanged. It also collected a
 * "Certifications & Documents" note with nowhere to be stored, and offered
 * Active/Inactive statuses that are not the statuses drivers actually have.
 *
 * It now reads the real company and provisions through the same endpoint as
 * Admin → Drivers → Add Driver, so the driver gets a login as well as a record.
 */

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { toast } from 'sonner'
import {
  Users,
  ArrowLeft,
  Save,
  Phone,
  Mail,
  FileText,
  Building2,
  AlertCircle
} from 'lucide-react'

interface FormData {
  full_name: string
  phone_number: string
  email: string
  license_number: string
  aadhar_number: string
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  is_verified: boolean
}

interface TransportCompany {
  id: string
  name: string
  registration_number: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/

export default function AddDriverPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [company, setCompany] = useState<TransportCompany | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    phone_number: '',
    email: '',
    license_number: '',
    aadhar_number: '',
    status: 'available',
    is_verified: false
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/transport-companies/${resolvedParams.id}`)
        const data = await response.json()

        if (response.ok && data.transportCompany) {
          setCompany({
            id: data.transportCompany.user_id,
            name: data.transportCompany.company_name,
            registration_number: data.transportCompany.registration_number || 'No registration number'
          })
        }
      } catch (error) {
        console.error('Error fetching transport company:', error)
      } finally {
        setIsLoadingData(false)
      }
    }

    fetchData()
  }, [resolvedParams.id])

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setSubmitError(null)
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!EMAIL_PATTERN.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address'
    }

    // Optional, and matched to what the server accepts, so the form cannot pass
    // something the provisioning endpoint will reject.
    const phone = formData.phone_number.trim()
    if (phone && !INDIAN_MOBILE_PATTERN.test(phone)) {
      newErrors.phone_number = 'Enter a 10-digit Indian mobile number (no country code, no leading zero)'
    }

    if (!formData.license_number.trim()) {
      newErrors.license_number = 'License number is required'
    }

    const aadhaar = formData.aadhar_number.trim()
    if (aadhaar && !/^\d{12}$/.test(aadhaar)) {
      newErrors.aadhar_number = 'Aadhaar must be 12 digits'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/admin/drivers/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone_number.trim(),
          license_number: formData.license_number.trim(),
          aadhar_number: formData.aadhar_number.trim(),
          status: formData.status,
          is_verified: formData.is_verified,
          transport_company_id: resolvedParams.id
        })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Failed to create driver')
      }

      toast.success(result.message || 'Driver created successfully!')
      router.push(`/admin/transport-companies/${resolvedParams.id}/drivers`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create driver'
      setSubmitError(message)
      toast.error(message)
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
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Add Driver
          </h1>
          <p className="text-gray-600">
            Add a new driver to {company.name} ({company.registration_number})
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Driver Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {submitError && (
                <div className="flex items-start text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
                  <span className="text-sm">{submitError}</span>
                </div>
              )}

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
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="license_number"
                    value={formData.license_number}
                    onChange={(e) => handleInputChange('license_number', e.target.value)}
                    placeholder="KL-1234567890"
                    className={`pl-10 ${errors.license_number ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.license_number && (
                  <p className="text-sm text-red-500">{errors.license_number}</p>
                )}
              </div>

              {/* Aadhaar Number */}
              <div className="space-y-2">
                <Label htmlFor="aadhar_number">Aadhaar Number</Label>
                <Input
                  id="aadhar_number"
                  value={formData.aadhar_number}
                  onChange={(e) => handleInputChange('aadhar_number', e.target.value)}
                  placeholder="123456789012"
                  maxLength={12}
                  className={errors.aadhar_number ? 'border-red-500' : ''}
                />
                {errors.aadhar_number && (
                  <p className="text-sm text-red-500">{errors.aadhar_number}</p>
                )}
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
                <p className="text-xs text-gray-500">
                  This becomes the driver&apos;s sign-in address. They set a password with &quot;Forgot password&quot;.
                </p>
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="phone_number"
                    value={formData.phone_number}
                    onChange={(e) => handleInputChange('phone_number', e.target.value)}
                    placeholder="10-digit mobile number"
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
                <Combobox
                  options={[
                    { value: 'available', label: 'Available' },
                    { value: 'assigned', label: 'Assigned' },
                    { value: 'on_trip', label: 'On Trip' },
                    { value: 'inactive', label: 'Inactive' }
                  ]}
                  value={formData.status}
                  onValueChange={(value) => handleInputChange('status', value)}
                  placeholder="Select status"
                  searchPlaceholder="Search status..."
                  emptyText="No status found."
                />
              </div>

              {/* Verification */}
              <div className="flex items-center space-x-2">
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
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Create Driver
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Help Card */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h3 className="font-medium text-gray-900 mb-2">Driver Registration Guidelines</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Full name must match official identification documents</li>
              <li>• License number should be unique and valid</li>
              <li>• Email address becomes the driver&apos;s login and is used for notifications</li>
              <li>• Phone number should be accessible for emergency contact</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
