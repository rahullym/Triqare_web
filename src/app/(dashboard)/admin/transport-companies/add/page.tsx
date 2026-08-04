'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import { toast } from 'sonner'
import {
  Building2,
  ArrowLeft,
  Save,
  User,
  MapPin,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import { useCreateTransportCompany, useTransportCompanies } from '@/hooks/useTransportCompanies'
import { useCountries, useStates, useCities, usePincodes } from '@/hooks/useLocations'
import { useUsersByRole } from '@/hooks/useUsers'

interface FormData {
  user_id: string
  company_name: string
  address_line: string
  registration_number: string
  license_valid_till: string
  country_id: string
  state_id: string
  city_id: string
  pincode_id: string
}

/**
 * Two ways to supply the login a company signs in with:
 *  - 'new'      creates it here, in one step (the common case when onboarding a
 *               company that has never touched the system);
 *  - 'existing' attaches the company to an account that already exists.
 *
 * Only the second used to be possible, so adding a real company meant first
 * inventing a password for them under Users → Add User and then coming back.
 */
type UserMode = 'new' | 'existing'

export default function AddTransportCompanyPage() {
  const router = useRouter()
  const [success, setSuccess] = useState(false)
  const [userMode, setUserMode] = useState<UserMode>('new')
  const [submitting, setSubmitting] = useState(false)
  const [provisionError, setProvisionError] = useState<string | null>(null)
  const [newUser, setNewUser] = useState({ full_name: '', email: '', phone: '' })
  const [formData, setFormData] = useState<FormData>({
    user_id: '',
    company_name: '',
    address_line: '',
    registration_number: '',
    license_valid_till: '',
    country_id: '',
    state_id: '',
    city_id: '',
    pincode_id: ''
  })

  // Hooks
  const { createTransportCompany, loading, error } = useCreateTransportCompany()
  const { countries } = useCountries()
  const { states } = useStates(formData.country_id || undefined)
  const { cities } = useCities(formData.state_id || undefined)
  const { pincodes } = usePincodes(formData.city_id || undefined)

  // Users hook for transport company role
  const { users: transportCompanyUsers, loading: usersLoading } = useUsersByRole('transport_company')
  // transport_companies is keyed by user_id, so an account that already has a
  // company cannot take a second one — offering it only produces a duplicate-key
  // error after the form is filled in.
  const { transportCompanies } = useTransportCompanies({ limit: 1000 })
  const takenUserIds = new Set(transportCompanies.map(c => c.user_id))
  const availableUsers = transportCompanyUsers.filter(u => !takenUserIds.has(u.id))

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const busy = loading || submitting
  const shownError = provisionError ?? error

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProvisionError(null)

    if (!formData.company_name) {
      toast.error('Company name is required')
      return
    }

    if (userMode === 'existing') {
      if (!formData.user_id) {
        toast.error('Select the user this company signs in as')
        return
      }
      try {
        await createTransportCompany(formData)
        setSuccess(true)
        toast.success('Transport company created successfully!')
        setTimeout(() => router.push('/admin/transport-companies'), 2000)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create transport company')
      }
      return
    }

    if (!newUser.full_name || !newUser.email) {
      toast.error('Contact name and email are required')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/transport-companies/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, ...newUser }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create transport company')
      }
      setSuccess(true)
      toast.success(result.message || 'Transport company created successfully!')
      setTimeout(() => router.push('/admin/transport-companies'), 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create transport company'
      setProvisionError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
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
            <h1 className="text-2xl font-bold text-gray-900">Add Transport Company</h1>
            <p className="text-gray-600">Create a new transport company record</p>
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
                <span>Transport company created successfully! Redirecting...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {shownError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center text-red-800">
                <AlertCircle className="h-5 w-5 mr-2" />
                <span>{shownError}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* User Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              Company Login
            </CardTitle>
            <CardDescription>The account this transport company will sign in with</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="user_mode"
                  checked={userMode === 'new'}
                  onChange={() => setUserMode('new')}
                />
                Create a new login
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="user_mode"
                  checked={userMode === 'existing'}
                  onChange={() => setUserMode('existing')}
                />
                Use an existing user
              </label>
            </div>

            {userMode === 'new' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="contact_name">Contact Person *</Label>
                  <Input
                    id="contact_name"
                    value={newUser.full_name}
                    onChange={(e) => setNewUser(prev => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label htmlFor="contact_email">Email *</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="company@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="contact_phone">Phone</Label>
                  <Input
                    id="contact_phone"
                    value={newUser.phone}
                    onChange={(e) => setNewUser(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="10-digit mobile"
                  />
                </div>
                <p className="text-sm text-gray-500 md:col-span-3">
                  They sign in by choosing &quot;Forgot password&quot; on the login page to set their own password.
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="user_id">User *</Label>
                <Combobox
                  options={availableUsers.map(user => ({
                    value: user.id,
                    label: `${user.full_name} (${user.email})`
                  }))}
                  value={formData.user_id}
                  onValueChange={(value) => handleInputChange('user_id', value)}
                  placeholder={usersLoading ? "Loading users..." : "Select a user"}
                  searchPlaceholder="Search users..."
                  emptyText="No users found"
                  disabled={usersLoading}
                  className="w-full"
                />
                {usersLoading && (
                  <p className="text-sm text-gray-500 mt-1">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-1" />
                    Loading transport company users...
                  </p>
                )}
                {!usersLoading && availableUsers.length === 0 && (
                  <p className="text-sm text-amber-600 mt-1">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    No unassigned transport-company accounts. Use &quot;Create a new login&quot; above.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building2 className="h-5 w-5 mr-2" />
              Company Information
            </CardTitle>
            <CardDescription>Basic company details and registration information</CardDescription>
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

        {/* Location Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Location Information
            </CardTitle>
            <CardDescription>Select the company's location details</CardDescription>
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
            <Button type="button" variant="outline" disabled={busy}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={busy || success}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : success ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Created
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Transport Company
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
