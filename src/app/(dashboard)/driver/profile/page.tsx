'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Truck,
  Edit3,
  Save,
  X,
  Bell,
  Shield,
  Activity,
  Star,
  Clock,
  Award,
  Loader2,
  Camera
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { DatabaseUser } from '@/lib/supabase'

export default function DriverProfilePage() {
  const { authUser, appUser, loading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbUser, setDbUser] = useState<DatabaseUser | null>(null)

  // Driver data from database
  const [driverData, setDriverData] = useState({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    licenseNumber: '',
    licenseClass: '',
    licenseExpiry: '',
    medicalCertExpiry: '',
    yearsExperience: '',
    specialCertifications: '',
    languagesSpoken: '',
    currentShift: '',
    vehicleAssigned: '',
    rating: '0.0',
    totalTrips: '0',
    lastTrip: '',
    accountCreated: ''
  })

  const [notifications, setNotifications] = useState({
    tripAssignments: true,
    emergencyAlerts: true,
    shiftReminders: true,
    trafficUpdates: true,
    systemUpdates: true,
    performanceReports: false
  })

  const [preferences, setPreferences] = useState({
    preferredShift: 'Day Shift',
    maxTripsPerDay: '8',
    breakDuration: '30',
    autoAcceptTrips: false,
    shareLocationAlways: true,
    receiveRatingFeedback: true
  })

  // Fetch user profile from database
  useEffect(() => {
    const fetchProfile = async () => {
      if (!authUser?.id) return

      try {
        const response = await fetch('/api/profile')
        if (response.ok) {
          const data = await response.json()
          setDbUser(data.user)

          // Initialize form data with database values
          setDriverData({
            fullName: data.user.full_name || `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || '',
            email: data.user.email || '',
            phone: data.user.phone || '',
            dateOfBirth: data.user.date_of_birth || '',
            address: data.user.address || '',
            emergencyContact: data.user.emergency_contact_name || '',
            emergencyPhone: data.user.emergency_contact_phone || '',
            licenseNumber: data.user.license_number || '',
            licenseClass: data.user.license_class || '',
            licenseExpiry: data.user.license_expiry || '',
            medicalCertExpiry: data.user.medical_cert_expiry || '',
            yearsExperience: data.user.years_experience || '',
            specialCertifications: data.user.special_certifications || '',
            languagesSpoken: data.user.languages_spoken || '',
            currentShift: data.user.current_shift || '',
            vehicleAssigned: data.user.vehicle_assigned || '',
            rating: data.user.rating || '0.0',
            totalTrips: data.user.total_trips || '0',
            lastTrip: data.user.last_trip || '',
            accountCreated: data.user.created_at || ''
          })
        } else {
          // Fallback to auth/app user data if database user doesn't exist
          setDriverData({
            fullName: `${appUser?.firstName || ''} ${appUser?.lastName || ''}`.trim(),
            email: appUser?.email ?? authUser?.email ?? '',
            phone: appUser?.phone || '',
            dateOfBirth: '',
            address: '',
            emergencyContact: '',
            emergencyPhone: '',
            licenseNumber: '',
            licenseClass: '',
            licenseExpiry: '',
            medicalCertExpiry: '',
            yearsExperience: '',
            specialCertifications: '',
            languagesSpoken: '',
            currentShift: '',
            vehicleAssigned: '',
            rating: '0.0',
            totalTrips: '0',
            lastTrip: '',
            accountCreated: ''
          })
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        toast.error('Failed to load profile data')
      } finally {
        setLoading(false)
      }
    }

    if (authUser && !authLoading) {
      fetchProfile()
    }
  }, [authUser, authLoading])

  const handleSave = async () => {
    setIsLoading(true)
    try {
      // Update profile in database
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: driverData.fullName.split(' ')[0] || '',
          last_name: driverData.fullName.split(' ').slice(1).join(' ') || '',
          full_name: driverData.fullName,
          phone: driverData.phone,
          bio: `Driver with ${driverData.yearsExperience} years experience`,
          date_of_birth: driverData.dateOfBirth,
          address: driverData.address,
          emergency_contact_name: driverData.emergencyContact,
          emergency_contact_phone: driverData.emergencyPhone,
          license_number: driverData.licenseNumber,
          license_class: driverData.licenseClass,
          license_expiry: driverData.licenseExpiry,
          medical_cert_expiry: driverData.medicalCertExpiry,
          years_experience: driverData.yearsExperience,
          special_certifications: driverData.specialCertifications,
          languages_spoken: driverData.languagesSpoken,
          current_shift: driverData.currentShift,
          vehicle_assigned: driverData.vehicleAssigned
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update profile')
      }

      const data = await response.json()
      setDbUser(data.user)
      toast.success('Profile updated successfully!')
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading state while fetching data
  if (authLoading || loading) {
    return (
      <RoleGuard allowedRoles={['driver']}>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 flex items-center justify-center">
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
    <RoleGuard allowedRoles={['driver']}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Avatar className="w-16 h-16">
              <AvatarImage
                src={dbUser?.avatar_url || undefined}
                alt={driverData.fullName || 'Driver'}
              />
              <AvatarFallback className="text-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {driverData.fullName ? driverData.fullName.split(' ').map(n => n[0]).join('').slice(0, 2) : 'DR'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                🚛 Driver Profile
              </h1>
              <p className="text-gray-600">
                Manage your driver information and preferences
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-blue-100 text-blue-800">
              <Truck className="h-3 w-3 mr-1" />
              Driver
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rating</CardTitle>
              <Star className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-yellow-600">{driverData.rating}/5</div>
              <p className="text-xs text-muted-foreground">
                Driver rating
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trips</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-blue-600">{driverData.totalTrips}</div>
              <p className="text-xs text-muted-foreground">
                Completed trips
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Experience</CardTitle>
              <Award className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-green-600">{driverData.yearsExperience} yrs</div>
              <p className="text-xs text-muted-foreground">
                Professional experience
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Shift</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-orange-600">Day</div>
              <p className="text-xs text-muted-foreground">
                06:00 - 18:00
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Profile Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Personal Info</TabsTrigger>
            <TabsTrigger value="professional">Professional</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={driverData.fullName}
                      onChange={(e) => setDriverData(prev => ({ ...prev, fullName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={driverData.email}
                      onChange={(e) => setDriverData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={driverData.phone}
                      onChange={(e) => setDriverData(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={driverData.dateOfBirth}
                      onChange={(e) => setDriverData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={driverData.address}
                    onChange={(e) => setDriverData(prev => ({ ...prev, address: e.target.value }))}
                    rows={2}
                  />
                </div>
                <Separator />
                <h4 className="font-semibold text-gray-900">Emergency Contact</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContact">Contact Name</Label>
                    <Input
                      id="emergencyContact"
                      value={driverData.emergencyContact}
                      onChange={(e) => setDriverData(prev => ({ ...prev, emergencyContact: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyPhone">Contact Phone</Label>
                    <Input
                      id="emergencyPhone"
                      type="tel"
                      value={driverData.emergencyPhone}
                      onChange={(e) => setDriverData(prev => ({ ...prev, emergencyPhone: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="professional" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Truck className="h-5 w-5 mr-2" />
                  Professional Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">License Number</Label>
                    <Input
                      id="licenseNumber"
                      value={driverData.licenseNumber}
                      onChange={(e) => setDriverData(prev => ({ ...prev, licenseNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="licenseClass">License Class</Label>
                    <Input
                      id="licenseClass"
                      value={driverData.licenseClass}
                      onChange={(e) => setDriverData(prev => ({ ...prev, licenseClass: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="licenseExpiry">License Expiry</Label>
                    <Input
                      id="licenseExpiry"
                      type="date"
                      value={driverData.licenseExpiry}
                      onChange={(e) => setDriverData(prev => ({ ...prev, licenseExpiry: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yearsExperience">Years of Experience</Label>
                    <Input
                      id="yearsExperience"
                      value={driverData.yearsExperience}
                      onChange={(e) => setDriverData(prev => ({ ...prev, yearsExperience: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialCertifications">Special Certifications</Label>
                  <Textarea
                    id="specialCertifications"
                    value={driverData.specialCertifications}
                    onChange={(e) => setDriverData(prev => ({ ...prev, specialCertifications: e.target.value }))}
                    placeholder="List your certifications..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="languagesSpoken">Languages Spoken</Label>
                  <Input
                    id="languagesSpoken"
                    value={driverData.languagesSpoken}
                    onChange={(e) => setDriverData(prev => ({ ...prev, languagesSpoken: e.target.value }))}
                    placeholder="e.g., English, Spanish, French"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleAssigned">Assigned Vehicle</Label>
                    <Input
                      id="vehicleAssigned"
                      value={driverData.vehicleAssigned}
                      onChange={(e) => setDriverData(prev => ({ ...prev, vehicleAssigned: e.target.value }))}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentShift">Current Shift</Label>
                    <Input
                      id="currentShift"
                      value={driverData.currentShift}
                      onChange={(e) => setDriverData(prev => ({ ...prev, currentShift: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="h-5 w-5 mr-2" />
                  Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(notifications).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {key === 'tripAssignments' && 'Get notified when new trips are assigned'}
                        {key === 'emergencyAlerts' && 'Receive emergency situation alerts'}
                        {key === 'shiftReminders' && 'Reminders for shift start/end times'}
                        {key === 'trafficUpdates' && 'Real-time traffic and route updates'}
                        {key === 'systemUpdates' && 'Important system updates and changes'}
                        {key === 'performanceReports' && 'Weekly performance and rating reports'}
                      </p>
                    </div>
                    <Switch
                      checked={value}
                      onCheckedChange={(checked) => 
                        setNotifications(prev => ({ ...prev, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Work Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(preferences).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {key === 'autoAcceptTrips' && 'Automatically accept trip assignments'}
                        {key === 'shareLocationAlways' && 'Share location with dispatch at all times'}
                        {key === 'receiveRatingFeedback' && 'Receive feedback on trip ratings'}
                      </p>
                    </div>
                    {typeof value === 'boolean' ? (
                      <Switch
                        checked={value}
                        onCheckedChange={(checked) => 
                          setPreferences(prev => ({ ...prev, [key]: checked }))
                        }
                      />
                    ) : (
                      <Input
                        value={value}
                        onChange={(e) => setPreferences(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-32"
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading}>
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
      </div>
    </RoleGuard>
  )
}
