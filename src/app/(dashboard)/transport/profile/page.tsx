'use client'

import { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  User,
  Mail,
  Phone,
  Building2,
  Bell,
  Settings,
  Save,
  Users,
  MapPin,
  FileText,
  Truck,
  Loader2,
  Camera,
  Shield,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { useCountries, useStates, useCities, usePincodes } from '@/hooks/useLocations'
import { DatabaseUser } from '@/lib/supabase'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface TransportCompany {
  user_id: string
  company_name: string
  address_line?: string
  registration_number?: string
  license_valid_till?: string
  is_verified: boolean
  user?: {
    id: string
    full_name: string
    email: string
    role: string
    created_at: string
  }
}

export default function TransportProfilePage() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbUser, setDbUser] = useState<DatabaseUser | null>(null)
  const [company, setCompany] = useState<TransportCompany | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Transport company data from database
  const [companyData, setCompanyData] = useState({
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    registrationNumber: '',
    licenseNumber: '',
    operatingHours: '',
    serviceArea: '',
    country_id: '',
    state_id: '',
    city_id: '',
    pincode_id: '',
    lastLogin: '',
    accountCreated: ''
  })

  const [notifications, setNotifications] = useState({
    assignmentAlerts: true,
    driverUpdates: true,
    maintenanceReminders: true,
    paymentNotifications: false,
    systemUpdates: true,
    emergencyAlerts: true
  })

  const [businessSettings, setBusinessSettings] = useState({
    autoAcceptAssignments: false,
    shareDriverLocation: true,
    allowEmergencyOverride: true,
    requireDriverConfirmation: true,
    enableRealTimeTracking: true
  })

  // Location hooks with dependencies
  const { countries } = useCountries()
  const { states } = useStates(companyData.country_id || undefined)
  const { cities } = useCities(companyData.state_id || undefined)
  const { pincodes } = usePincodes(companyData.city_id || undefined)

  // Fetch user profile and company data from database
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return

      try {
        setLoading(true)
        setError(null)

        // Fetch user profile
        const profileResponse = await fetch('/api/profile')
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          setDbUser(profileData.user)
        }

        // Fetch transport company data
        const companyResponse = await fetch('/api/transport/company')
        if (companyResponse.ok) {
          const companyData = await companyResponse.json()
          if (companyData.success) {
            setCompany(companyData.company)

            // Initialize form data with company values
            setCompanyData({
              companyName: companyData.company.company_name || 'Transport Company',
              contactPerson: companyData.company.user?.full_name || '',
              email: companyData.company.user?.email || '',
              phone: companyData.company.user?.phone || '',
              address: companyData.company.address_line || '',
              registrationNumber: companyData.company.registration_number || '',
              licenseNumber: companyData.company.license_valid_till || '', // License number stored as text in license_valid_till
              operatingHours: '24/7',
              serviceArea: 'Metropolitan Area',
              country_id: companyData.company.country_id || '',
              state_id: companyData.company.state_id || '',
              city_id: companyData.company.city_id || '',
              pincode_id: companyData.company.pincode_id || '',
              lastLogin: companyData.company.user?.last_sign_in_at || '',
              accountCreated: companyData.company.user?.created_at || ''
            })
          }
        } else {
          // Fallback to Clerk data if company doesn't exist
          setCompanyData({
            companyName: 'Transport Company',
            contactPerson: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: user.primaryEmailAddress?.emailAddress || '',
            phone: user.phoneNumbers?.[0]?.phoneNumber || '',
            address: '',
            registrationNumber: '',
            licenseNumber: '',
            operatingHours: '24/7',
            serviceArea: 'Metropolitan Area',
            country_id: '',
            state_id: '',
            city_id: '',
            pincode_id: '',
            lastLogin: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : '',
            accountCreated: user.createdAt ? new Date(user.createdAt).toISOString() : ''
          })
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        setError(error instanceof Error ? error.message : 'Failed to load profile data')
        toast.error('Failed to load profile data')
      } finally {
        setLoading(false)
      }
    }

    if (user && isLoaded) {
      fetchProfile()
    }
  }, [user, isLoaded])

  // Location change handlers to reset dependent fields
  const handleCountryChange = (value: string) => {
    setCompanyData(prev => ({
      ...prev,
      country_id: value,
      state_id: '',
      city_id: '',
      pincode_id: ''
    }))
  }

  const handleStateChange = (value: string) => {
    setCompanyData(prev => ({
      ...prev,
      state_id: value,
      city_id: '',
      pincode_id: ''
    }))
  }

  const handleCityChange = (value: string) => {
    setCompanyData(prev => ({
      ...prev,
      city_id: value,
      pincode_id: ''
    }))
  }

  const handleSaveProfile = async () => {
    setIsLoading(true)
    try {


      // Update user profile in users table (only fields that exist in users table)
      const userResponse = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: companyData.contactPerson.split(' ')[0] || '',
          last_name: companyData.contactPerson.split(' ').slice(1).join(' ') || '',
          full_name: companyData.contactPerson,
          phone: companyData.phone,
          bio: `Transport company: ${companyData.companyName} operating in ${companyData.serviceArea}`,
          // License number is now stored in transport_companies.license_valid_till
        }),
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error('User profile update failed:', errorText)
        throw new Error('Failed to update user profile')
      }

      // Update transport company information in transport_companies table
      const companyResponse = await fetch('/api/transport/company', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: companyData.companyName,
          address_line: companyData.address,
          registration_number: companyData.registrationNumber,
          license_valid_till: companyData.licenseNumber, // Now storing license number as text
          country_id: companyData.country_id || null,
          state_id: companyData.state_id || null,
          city_id: companyData.city_id || null,
          pincode_id: companyData.pincode_id || null
        }),
      })

      if (!companyResponse.ok) {
        const errorData = await companyResponse.json()
        console.error('Company update failed:', errorData)
        // Still show success if user profile updated, but warn about company data
        toast.warning('User profile updated, but company information update failed')
      } else {
        toast.success('Profile updated successfully!')
      }

      const userData = await userResponse.json()
      setDbUser(userData.user)

    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }))
  }

  const handleBusinessSettingChange = (key: string, value: boolean) => {
    setBusinessSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleDeleteAccount = async () => {
    if (!dbUser?.id) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/users/${dbUser.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to delete account')
      }
      toast.success('Account deleted successfully')
      await signOut()
      router.push('/')
    } catch (error) {
      console.error('Error deleting account:', error)
      toast.error('Failed to delete account. Please try again.')
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  // Show loading state while fetching data
  if (!isLoaded || loading) {
    return (
      <RoleGuard allowedRoles={['transport_company']}>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading your profile...</p>
            </CardContent>
          </Card>
        </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['transport_company']}>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Avatar className="w-16 h-16">
            <AvatarImage
              src={dbUser?.avatar_url || user?.imageUrl}
              alt={companyData.companyName || 'Transport Company'}
            />
            <AvatarFallback className="text-lg bg-gradient-to-br from-green-500 to-blue-600 text-white">
              {companyData.companyName ? companyData.companyName.split(' ').map(n => n[0]).join('').slice(0, 2) : 'TC'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              🚛 Transport Company Profile
            </h1>
            <p className="text-gray-600">
              Manage your transport company profile and business settings
            </p>
          </div>
        </div>
        <Badge variant="default" className="px-3 py-1">
          <Building2 className="h-4 w-4 mr-1" />
          Transport Partner
        </Badge>
      </div>

      {/* Profile Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Company Status</CardTitle>
            <Building2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Active</div>
            <p className="text-xs text-muted-foreground">
              Operational
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">12</div>
            <p className="text-xs text-muted-foreground">
              On duty today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assignments Today</CardTitle>
            <Truck className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">23</div>
            <p className="text-xs text-muted-foreground">
              Completed trips
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Service Area</CardTitle>
            <MapPin className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-orange-600">Metro</div>
            <p className="text-xs text-muted-foreground">
              Coverage zone
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Profile Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Company Information</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="settings">Business Settings</TabsTrigger>
        </TabsList>

        {/* Company Information Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar Section */}
              <div className="flex items-center space-x-6 pb-6 border-b">
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage
                      src={dbUser?.avatar_url || user?.imageUrl}
                      alt={companyData.companyName || 'Transport Company'}
                    />
                    <AvatarFallback className="text-xl bg-gradient-to-br from-green-500 to-blue-600 text-white">
                      {companyData.companyName ? companyData.companyName.split(' ').map(n => n[0]).join('').slice(0, 2) : 'TC'}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="sm"
                    className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                    onClick={() => toast.info('Avatar upload coming soon!')}
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">
                    {companyData.companyName || 'Transport Company'}
                  </h3>
                  <p className="text-gray-600 mb-2">Transport Service Provider</p>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <Building2 className="w-3 h-3 mr-1" />
                    Transport Partner
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyData.companyName}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, companyName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number</Label>
                  <Input
                    id="registrationNumber"
                    value={companyData.registrationNumber}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, registrationNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person</Label>
                  <Input
                    id="contactPerson"
                    value={companyData.contactPerson}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, contactPerson: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <Input
                    id="licenseNumber"
                    value={companyData.licenseNumber}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, licenseNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={companyData.email}
                      onChange={(e) => setCompanyData(prev => ({ ...prev, email: e.target.value }))}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      value={companyData.phone}
                      onChange={(e) => setCompanyData(prev => ({ ...prev, phone: e.target.value }))}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operatingHours">Operating Hours</Label>
                  <Input
                    id="operatingHours"
                    value={companyData.operatingHours}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, operatingHours: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serviceArea">Service Area</Label>
                  <Input
                    id="serviceArea"
                    value={companyData.serviceArea}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, serviceArea: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="address">Business Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Textarea
                    id="address"
                    value={companyData.address}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, address: e.target.value }))}
                    className="pl-10 min-h-[80px]"
                    rows={3}
                  />
                </div>
              </div>

              {/* Location Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country_id">Country</Label>
                  <Combobox
                    options={countries?.map((country): ComboboxOption => ({
                      value: country.id,
                      label: country.name
                    })) || []}
                    value={companyData.country_id}
                    onValueChange={handleCountryChange}
                    placeholder="Select country"
                    searchPlaceholder="Search countries..."
                    emptyText="No countries found."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state_id">State/Province</Label>
                  <Combobox
                    options={states?.map((state): ComboboxOption => ({
                      value: state.id,
                      label: state.name
                    })) || []}
                    value={companyData.state_id}
                    onValueChange={handleStateChange}
                    disabled={!companyData.country_id}
                    placeholder="Select state"
                    searchPlaceholder="Search states..."
                    emptyText="No states found."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city_id">City</Label>
                  <Combobox
                    options={cities?.map((city): ComboboxOption => ({
                      value: city.id,
                      label: city.name
                    })) || []}
                    value={companyData.city_id}
                    onValueChange={handleCityChange}
                    disabled={!companyData.state_id}
                    placeholder="Select city"
                    searchPlaceholder="Search cities..."
                    emptyText="No cities found."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pincode_id">Postal/ZIP Code</Label>
                  <Combobox
                    options={pincodes?.map((pincode): ComboboxOption => ({
                      value: pincode.id,
                      label: pincode.code
                    })) || []}
                    value={companyData.pincode_id}
                    onValueChange={(value) => setCompanyData(prev => ({ ...prev, pincode_id: value }))}
                    disabled={!companyData.city_id}
                    placeholder="Select postal code"
                    searchPlaceholder="Search postal codes..."
                    emptyText="No postal codes found."
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <Button onClick={handleSaveProfile} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Assignment Alerts</Label>
                    <p className="text-sm text-gray-600">New assignment notifications</p>
                  </div>
                  <Switch
                    checked={notifications.assignmentAlerts}
                    onCheckedChange={(checked) => handleNotificationChange('assignmentAlerts', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Driver Updates</Label>
                    <p className="text-sm text-gray-600">Driver status and location updates</p>
                  </div>
                  <Switch
                    checked={notifications.driverUpdates}
                    onCheckedChange={(checked) => handleNotificationChange('driverUpdates', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Emergency Alerts</Label>
                    <p className="text-sm text-gray-600">Critical emergency notifications</p>
                  </div>
                  <Switch
                    checked={notifications.emergencyAlerts}
                    onCheckedChange={(checked) => handleNotificationChange('emergencyAlerts', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Maintenance Reminders</Label>
                    <p className="text-sm text-gray-600">Vehicle maintenance schedules</p>
                  </div>
                  <Switch
                    checked={notifications.maintenanceReminders}
                    onCheckedChange={(checked) => handleNotificationChange('maintenanceReminders', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Payment Notifications</Label>
                    <p className="text-sm text-gray-600">Payment and billing updates</p>
                  </div>
                  <Switch
                    checked={notifications.paymentNotifications}
                    onCheckedChange={(checked) => handleNotificationChange('paymentNotifications', checked)}
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <Button onClick={handleSaveProfile} disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Notification Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Business Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-Accept Assignments</Label>
                    <p className="text-sm text-gray-600">Automatically accept new assignments</p>
                  </div>
                  <Switch
                    checked={businessSettings.autoAcceptAssignments}
                    onCheckedChange={(checked) => handleBusinessSettingChange('autoAcceptAssignments', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Share Driver Location</Label>
                    <p className="text-sm text-gray-600">Share real-time driver locations</p>
                  </div>
                  <Switch
                    checked={businessSettings.shareDriverLocation}
                    onCheckedChange={(checked) => handleBusinessSettingChange('shareDriverLocation', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Emergency Override</Label>
                    <p className="text-sm text-gray-600">Allow emergency assignment overrides</p>
                  </div>
                  <Switch
                    checked={businessSettings.allowEmergencyOverride}
                    onCheckedChange={(checked) => handleBusinessSettingChange('allowEmergencyOverride', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Driver Confirmation Required</Label>
                    <p className="text-sm text-gray-600">Require driver confirmation for assignments</p>
                  </div>
                  <Switch
                    checked={businessSettings.requireDriverConfirmation}
                    onCheckedChange={(checked) => handleBusinessSettingChange('requireDriverConfirmation', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Real-Time Tracking</Label>
                    <p className="text-sm text-gray-600">Enable GPS tracking for all vehicles</p>
                  </div>
                  <Switch
                    checked={businessSettings.enableRealTimeTracking}
                    onCheckedChange={(checked) => handleBusinessSettingChange('enableRealTimeTracking', checked)}
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <Button onClick={handleSaveProfile} disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Business Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-gray-500">Registration Number</label>
                  <p className="font-medium">{companyData.registrationNumber || 'Not provided'}</p>
                </div>
                <div>
                  <label className="text-gray-500">License Number</label>
                  <p className="font-medium">{companyData.licenseNumber || 'Not provided'}</p>
                </div>
                <div>
                  <label className="text-gray-500">Country</label>
                  <p className="font-medium">
                    {countries?.find(c => c.id === companyData.country_id)?.name || 'Not provided'}
                  </p>
                </div>
                <div>
                  <label className="text-gray-500">State/Province</label>
                  <p className="font-medium">
                    {states?.find(s => s.id === companyData.state_id)?.name || 'Not provided'}
                  </p>
                </div>
                <div>
                  <label className="text-gray-500">City</label>
                  <p className="font-medium">
                    {cities?.find(c => c.id === companyData.city_id)?.name || 'Not provided'}
                  </p>
                </div>
                <div>
                  <label className="text-gray-500">Postal/ZIP Code</label>
                  <p className="font-medium">
                    {pincodes?.find(p => p.id === companyData.pincode_id)?.code || 'Not provided'}
                  </p>
                </div>
                <div>
                  <label className="text-gray-500">Account Created</label>
                  <p className="font-medium">{new Date(companyData.accountCreated).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-gray-500">Last Login</label>
                  <p className="font-medium">{new Date(companyData.lastLogin).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Delete Account</p>
                  <p className="text-sm text-gray-600">Permanently delete your account and all associated company data. This action cannot be undone.</p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={!dbUser}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all associated data including company information, driver records, and assignment history. This action <strong>cannot be undone</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete My Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RoleGuard>
  )
}
