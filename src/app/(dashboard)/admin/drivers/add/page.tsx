'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Car,
  ArrowLeft,
  Save,
  User,
  MapPin,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Building2
} from 'lucide-react'
import Link from 'next/link'
import { useCreateDriver } from '@/hooks/useDrivers'
import { useTransportCompanies } from '@/hooks/useTransportCompanies'
import { useCountries, useStates, useCities, usePincodes } from '@/hooks/useLocations'
import { useUsersByRole } from '@/hooks/useUsers'

interface FormData {
  user_id: string
  transport_company_id: string
  license_number: string
  aadhar_number: string
  is_verified: boolean
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  country_id: string
  state_id: string
  city_id: string
  pincode_id: string
  address_line: string
}

export default function AddDriverPage() {
  const router = useRouter()
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    user_id: '',
    transport_company_id: '',
    license_number: '',
    aadhar_number: '',
    is_verified: false,
    status: 'available',
    country_id: '',
    state_id: '',
    city_id: '',
    pincode_id: '',
    address_line: ''
  })

  // Hooks
  const { createDriver, loading, error } = useCreateDriver()
  const { transportCompanies } = useTransportCompanies({ limit: 1000 })
  const { countries } = useCountries()
  const { states } = useStates(formData.country_id || undefined)
  const { cities } = useCities(formData.state_id || undefined)
  const { pincodes } = usePincodes(formData.city_id || undefined)
  
  // Users hook for driver role
  const { users: driverUsers, loading: usersLoading } = useUsersByRole('driver')

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    if (!formData.user_id || !formData.transport_company_id || !formData.license_number) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const result = await createDriver({
        user_id: formData.user_id,
        transport_company_id: formData.transport_company_id,
        license_number: formData.license_number,
        aadhar_number: formData.aadhar_number,
        is_verified: formData.is_verified,
        status: formData.status,
        country_id: formData.country_id || undefined,
        state_id: formData.state_id || undefined,
        city_id: formData.city_id || undefined,
        pincode_id: formData.pincode_id || undefined,
        address_line: formData.address_line || undefined
      })

      if (result) {
        setSuccess(true)
        toast.success('Driver created successfully!')
        setTimeout(() => {
          router.push('/admin/drivers')
        }, 2000)
      }
    } catch (err) {
      console.error('Error creating driver:', err)
      toast.error('Failed to create driver')
    }
  }

  if (success) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Driver Created Successfully!</h3>
              <p className="text-sm text-gray-600 mb-4">
                The driver has been added to the system and is ready for assignment.
              </p>
              <Button onClick={() => router.push('/admin/drivers')} className="w-full">
                View All Drivers
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Add New Driver</h1>
            <p className="text-gray-600">Create a new driver profile in the system</p>
          </div>
          <Link href="/admin/drivers">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Drivers
            </Button>
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* User Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              User Assignment
            </CardTitle>
            <CardDescription>Select the user who will be assigned as this driver</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="user_id">User *</Label>
              <Combobox
                options={driverUsers.map(user => ({
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
                  Loading driver users...
                </p>
              )}
              {!usersLoading && driverUsers.length === 0 && (
                <p className="text-sm text-amber-600 mt-1">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  No users with 'driver' role found. Please create users first.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transport Company Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building2 className="h-5 w-5 mr-2" />
              Transport Company
            </CardTitle>
            <CardDescription>Assign driver to a transport company</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="transport_company_id">Transport Company *</Label>
              <Combobox
                options={transportCompanies.map(company => ({
                  value: company.user_id,
                  label: `${company.company_name} (${company.registration_number})`
                }))}
                value={formData.transport_company_id}
                onValueChange={(value) => handleInputChange('transport_company_id', value)}
                placeholder="Select a transport company"
                searchPlaceholder="Search companies..."
                emptyText="No transport companies found"
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* Driver Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Driver Information
            </CardTitle>
            <CardDescription>Enter driver license and identification details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="license_number">License Number *</Label>
                <Input
                  id="license_number"
                  placeholder="Enter license number"
                  value={formData.license_number}
                  onChange={(e) => handleInputChange('license_number', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="aadhar_number">Aadhar Number</Label>
                <Input
                  id="aadhar_number"
                  placeholder="Enter Aadhar number"
                  value={formData.aadhar_number}
                  onChange={(e) => handleInputChange('aadhar_number', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Combobox
                  options={[
                    { value: "available", label: "Available" },
                    { value: "assigned", label: "Assigned" },
                    { value: "on_trip", label: "On Trip" },
                    { value: "inactive", label: "Inactive" }
                  ]}
                  value={formData.status}
                  onValueChange={(value) => handleInputChange('status', value)}
                  placeholder="Select status"
                  searchPlaceholder="Search status..."
                  emptyText="No status found."
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="is_verified"
                  checked={formData.is_verified}
                  onChange={(e) => handleInputChange('is_verified', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="is_verified">Verified Driver</Label>
              </div>
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
            <CardDescription>Driver's location details (optional)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country_id">Country</Label>
                <Combobox
                  options={countries.map(country => ({
                    value: country.id,
                    label: country.name
                  }))}
                  value={formData.country_id}
                  onValueChange={(value) => handleInputChange('country_id', value)}
                  placeholder="Select country"
                  searchPlaceholder="Search countries..."
                  emptyText="No countries found"
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="state_id">State</Label>
                <Combobox
                  options={states.map(state => ({
                    value: state.id,
                    label: state.name
                  }))}
                  value={formData.state_id}
                  onValueChange={(value) => handleInputChange('state_id', value)}
                  placeholder="Select state"
                  searchPlaceholder="Search states..."
                  emptyText="No states found"
                  disabled={!formData.country_id}
                  className="w-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city_id">City</Label>
                <Combobox
                  options={cities.map(city => ({
                    value: city.id,
                    label: city.name
                  }))}
                  value={formData.city_id}
                  onValueChange={(value) => handleInputChange('city_id', value)}
                  placeholder="Select city"
                  searchPlaceholder="Search cities..."
                  emptyText="No cities found"
                  disabled={!formData.state_id}
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="pincode_id">Pincode</Label>
                <Combobox
                  options={pincodes.map(pincode => ({
                    value: pincode.id,
                    label: pincode.code
                  }))}
                  value={formData.pincode_id}
                  onValueChange={(value) => handleInputChange('pincode_id', value)}
                  placeholder="Select pincode"
                  searchPlaceholder="Search pincodes..."
                  emptyText="No pincodes found"
                  disabled={!formData.city_id}
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="address_line">Address Line</Label>
              <Textarea
                id="address_line"
                placeholder="Enter detailed address"
                value={formData.address_line}
                onChange={(e) => handleInputChange('address_line', e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end space-x-4">
          <Link href="/admin/drivers">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating Driver...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Driver
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error creating driver</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
