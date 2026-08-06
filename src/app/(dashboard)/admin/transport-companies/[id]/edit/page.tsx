'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Building2,
  ArrowLeft,
  Save,
  MapPin,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  ShieldCheck,
  UserRound
} from 'lucide-react'
import Link from 'next/link'
import { useTransportCompany, useUpdateTransportCompany } from '@/hooks/useTransportCompanies'
import { useCountries, useStates, useCities, usePincodes } from '@/hooks/useLocations'

interface FormData {
  company_name: string
  address_line: string
  registration_number: string
  license_valid_till: string
  is_verified: boolean
  country_id: string
  state_id: string
  city_id: string
  pincode_id: string
}

/**
 * The login behind the company. It lives on `users`, not `transport_companies`,
 * so it is saved through the user endpoint alongside the company update — the
 * edit screen previously showed no way to see or correct the address the company
 * actually signs in with.
 */
interface ContactData {
  full_name: string
  email: string
  phone: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/

export default function EditTransportCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const [success, setSuccess] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactSaving, setContactSaving] = useState(false)
  const [contact, setContact] = useState<ContactData>({
    full_name: '',
    email: '',
    phone: ''
  })
  const [formData, setFormData] = useState<FormData>({
    company_name: '',
    address_line: '',
    registration_number: '',
    license_valid_till: '',
    is_verified: false,
    country_id: '',
    state_id: '',
    city_id: '',
    pincode_id: ''
  })

  // Hooks
  const { transportCompany, loading: loadingCompany, error: companyError } = useTransportCompany(resolvedParams.id)
  const { updateTransportCompany, loading, error } = useUpdateTransportCompany()
  const { countries } = useCountries()
  const { states } = useStates(formData.country_id || undefined)
  const { cities } = useCities(formData.state_id || undefined)
  const { pincodes } = usePincodes(formData.city_id || undefined)

  // Load existing data
  useEffect(() => {
    if (transportCompany) {
      setFormData({
        company_name: transportCompany.company_name || '',
        address_line: transportCompany.address_line || '',
        registration_number: transportCompany.registration_number || '',
        license_valid_till: transportCompany.license_valid_till || '',
        is_verified: transportCompany.is_verified || false,
        country_id: transportCompany.country_id || '',
        state_id: transportCompany.state_id || '',
        city_id: transportCompany.city_id || '',
        pincode_id: transportCompany.pincode_id || ''
      })
      setContact({
        full_name: transportCompany.user?.full_name || '',
        email: transportCompany.user?.email || '',
        phone: transportCompany.user?.phone || ''
      })
    }
  }, [transportCompany])

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleContactChange = (field: keyof ContactData, value: string) => {
    setContact(prev => ({ ...prev, [field]: value }))
    setContactError(null)
  }

  /**
   * Save the login fields. Kept separate from the company update because they are
   * different tables behind different endpoints; the company save must not be
   * held hostage by a contact-only validation error, and vice versa.
   */
  const saveContact = async (userId: string): Promise<boolean> => {
    const email = contact.email.trim().toLowerCase()
    const fullName = contact.full_name.trim()
    const phone = contact.phone.trim()

    if (!fullName) {
      setContactError('Contact name is required.')
      return false
    }
    if (!EMAIL_PATTERN.test(email)) {
      setContactError(`"${contact.email}" is not a valid email address.`)
      return false
    }
    if (phone && !INDIAN_MOBILE_PATTERN.test(phone)) {
      setContactError(`"${phone}" is not a valid 10-digit Indian mobile number (no country code, no leading zero).`)
      return false
    }

    const unchanged =
      fullName === (transportCompany?.user?.full_name || '') &&
      email === (transportCompany?.user?.email || '').toLowerCase() &&
      phone === (transportCompany?.user?.phone || '')
    if (unchanged) return true

    setContactSaving(true)
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, phone: phone || null })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === false) {
        setContactError(result.error || 'Failed to update the contact details.')
        return false
      }
      return true
    } catch {
      setContactError('Failed to update the contact details.')
      return false
    } finally {
      setContactSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const userId = transportCompany?.user?.id
    if (userId) {
      const contactSaved = await saveContact(userId)
      if (!contactSaved) {
        toast.error('Fix the contact details before saving.')
        return
      }
    }

    try {
      await updateTransportCompany(resolvedParams.id, formData)
      setSuccess(true)
      toast.success('Transport company updated successfully!')

      setTimeout(() => {
        router.push('/admin/transport-companies')
      }, 2000)
    } catch (err) {
      // The hook's `error` state carries the real reason (shown above the form);
      // a bare "Failed to update" toast is what left the operator with nothing to act on.
      toast.error(err instanceof Error ? err.message : 'Failed to update transport company')
    }
  }

  if (loadingCompany) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Edit Transport Company</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (companyError || !transportCompany) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Edit Transport Company</h1>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-800">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>Error loading transport company: {companyError || 'Company not found'}</span>
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
        <div className="flex items-center space-x-4">
          <Link href="/admin/transport-companies">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Transport Companies
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Transport Company</h1>
            <p className="text-gray-600">Update transport company information</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success Message */}
        {success && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center text-green-800">
                <CheckCircle className="h-5 w-5 mr-2" />
                <span>Transport company updated successfully! Redirecting...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center text-red-800">
                <AlertCircle className="h-5 w-5 mr-2" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building2 className="h-5 w-5 mr-2" />
              Company Information
            </CardTitle>
            <CardDescription>Update basic company details and registration information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="company_name">Company Name *</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                  placeholder="Enter company name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="registration_number">Registration Number</Label>
                <Input
                  id="registration_number"
                  value={formData.registration_number}
                  onChange={(e) => handleInputChange('registration_number', e.target.value)}
                  placeholder="Enter registration number"
                />
              </div>
              <div>
                <Label htmlFor="license_valid_till">License Valid Till</Label>
                <Input
                  id="license_valid_till"
                  type="date"
                  value={formData.license_valid_till}
                  onChange={(e) => handleInputChange('license_valid_till', e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="address_line">Address</Label>
              <Textarea
                id="address_line"
                value={formData.address_line}
                onChange={(e) => handleInputChange('address_line', e.target.value)}
                placeholder="Enter company address"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact / login account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <UserRound className="h-5 w-5 mr-2" />
              Contact & Login
            </CardTitle>
            <CardDescription>
              The person who signs in for this company. Changing the email changes the address they log in with.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contactError && (
              <div className="flex items-start text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
                <AlertCircle className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
                <span className="text-sm">{contactError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="contact_full_name">Contact Name *</Label>
                <Input
                  id="contact_full_name"
                  value={contact.full_name}
                  onChange={(e) => handleContactChange('full_name', e.target.value)}
                  placeholder="Enter contact person's name"
                />
              </div>
              <div>
                <Label htmlFor="contact_email">Email *</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={contact.email}
                  onChange={(e) => handleContactChange('email', e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <Label htmlFor="contact_phone">Phone</Label>
                <Input
                  id="contact_phone"
                  value={contact.phone}
                  onChange={(e) => handleContactChange('phone', e.target.value)}
                  placeholder="10-digit mobile number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Verification Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              Verification Status
            </CardTitle>
            <CardDescription>Manage company verification status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_verified"
                checked={formData.is_verified}
                onCheckedChange={(checked) => handleInputChange('is_verified', checked)}
              />
              <Label htmlFor="is_verified" className="flex items-center">
                {formData.is_verified ? (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-1 text-green-600" />
                    Verified Company
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-1 text-yellow-600" />
                    Pending Verification
                  </>
                )}
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Location Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Location Information
            </CardTitle>
            <CardDescription>Update the company's location details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country_id">Country</Label>
                <Combobox
                  options={countries?.map((country): ComboboxOption => ({
                    value: country.id,
                    label: country.name
                  })) || []}
                  value={formData.country_id}
                  onValueChange={(value) => {
                    handleInputChange('country_id', value)
                    handleInputChange('state_id', '')
                    handleInputChange('city_id', '')
                    handleInputChange('pincode_id', '')
                  }}
                  placeholder="Select country"
                  searchPlaceholder="Search countries..."
                  emptyText="No countries found."
                />
              </div>
              <div>
                <Label htmlFor="state_id">State</Label>
                <Combobox
                  options={states?.map((state): ComboboxOption => ({
                    value: state.id,
                    label: state.name
                  })) || []}
                  value={formData.state_id}
                  onValueChange={(value) => {
                    handleInputChange('state_id', value)
                    handleInputChange('city_id', '')
                    handleInputChange('pincode_id', '')
                  }}
                  disabled={!formData.country_id}
                  placeholder="Select state"
                  searchPlaceholder="Search states..."
                  emptyText="No states found."
                />
              </div>
              <div>
                <Label htmlFor="city_id">City</Label>
                <Combobox
                  options={cities?.map((city): ComboboxOption => ({
                    value: city.id,
                    label: city.name
                  })) || []}
                  value={formData.city_id}
                  onValueChange={(value) => {
                    handleInputChange('city_id', value)
                    handleInputChange('pincode_id', '')
                  }}
                  disabled={!formData.state_id}
                  placeholder="Select city"
                  searchPlaceholder="Search cities..."
                  emptyText="No cities found."
                />
              </div>
              <div>
                <Label htmlFor="pincode_id">Pincode</Label>
                <Combobox
                  options={pincodes?.map((pincode): ComboboxOption => ({
                    value: pincode.id,
                    label: pincode.code
                  })) || []}
                  value={formData.pincode_id}
                  onValueChange={(value) => handleInputChange('pincode_id', value)}
                  disabled={!formData.city_id}
                  placeholder="Select pincode"
                  searchPlaceholder="Search pincodes..."
                  emptyText="No pincodes found."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end space-x-4">
          <Link href="/admin/transport-companies">
            <Button type="button" variant="outline" disabled={loading}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading || contactSaving || success}>
            {loading || contactSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : success ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Updated
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Update Transport Company
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

