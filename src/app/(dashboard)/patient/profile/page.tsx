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
  Heart,
  Edit3,
  Save,
  X,
  Bell,
  Shield,
  Activity,
  AlertTriangle,
  Loader2,
  Camera
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { DatabaseUser } from '@/lib/supabase'

export default function PatientProfilePage() {
  const { authUser, appUser, loading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbUser, setDbUser] = useState<DatabaseUser | null>(null)

  // Patient data from database
  const [patientData, setPatientData] = useState({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    bloodType: '',
    allergies: '',
    medicalConditions: '',
    medications: '',
    insuranceProvider: '',
    insuranceNumber: '',
    lastCheckup: '',
    accountCreated: ''
  })

  const [notifications, setNotifications] = useState({
    emergencyAlerts: true,
    appointmentReminders: true,
    medicationReminders: true,
    healthTips: false,
    systemUpdates: true,
    marketingEmails: false
  })

  const [preferences, setPreferences] = useState({
    preferredLanguage: 'English',
    preferredHospital: 'City General Hospital',
    shareDataWithProviders: true,
    allowEmergencyAccess: true,
    receiveHealthReports: true
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
          setPatientData({
            fullName: data.user.full_name || `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || '',
            email: data.user.email || '',
            phone: data.user.phone || '',
            dateOfBirth: data.user.date_of_birth || '',
            address: data.user.address || '',
            emergencyContact: data.user.emergency_contact_name || '',
            emergencyPhone: data.user.emergency_contact_phone || '',
            bloodType: data.user.blood_type || '',
            allergies: data.user.allergies || '',
            medicalConditions: data.user.medical_conditions || '',
            medications: data.user.medications || '',
            insuranceProvider: data.user.insurance_provider || '',
            insuranceNumber: data.user.insurance_number || '',
            lastCheckup: data.user.last_checkup || '',
            accountCreated: data.user.created_at || ''
          })
        } else {
          // Fallback to auth/app user data if database user doesn't exist
          setPatientData({
            fullName: `${appUser?.firstName || ''} ${appUser?.lastName || ''}`.trim(),
            email: appUser?.email ?? authUser?.email ?? '',
            phone: appUser?.phone || '',
            dateOfBirth: '',
            address: '',
            emergencyContact: '',
            emergencyPhone: '',
            bloodType: '',
            allergies: '',
            medicalConditions: '',
            medications: '',
            insuranceProvider: '',
            insuranceNumber: '',
            lastCheckup: '',
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
          first_name: patientData.fullName.split(' ')[0] || '',
          last_name: patientData.fullName.split(' ').slice(1).join(' ') || '',
          full_name: patientData.fullName,
          phone: patientData.phone,
          bio: `Patient profile with medical conditions: ${patientData.medicalConditions}`,
          date_of_birth: patientData.dateOfBirth,
          address: patientData.address,
          emergency_contact_name: patientData.emergencyContact,
          emergency_contact_phone: patientData.emergencyPhone,
          blood_type: patientData.bloodType,
          allergies: patientData.allergies,
          medical_conditions: patientData.medicalConditions,
          medications: patientData.medications,
          insurance_provider: patientData.insuranceProvider,
          insurance_number: patientData.insuranceNumber,
          last_checkup: patientData.lastCheckup
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
      <RoleGuard allowedRoles={['patient']}>
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center">
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
    <RoleGuard allowedRoles={['patient']}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Avatar className="w-16 h-16">
              <AvatarImage
                src={dbUser?.avatar_url || undefined}
                alt={patientData.fullName || 'Patient'}
              />
              <AvatarFallback className="text-lg bg-gradient-to-br from-blue-500 to-green-600 text-white">
                {patientData.fullName ? patientData.fullName.split(' ').map(n => n[0]).join('').slice(0, 2) : 'PT'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                🏥 Patient Profile
              </h1>
              <p className="text-gray-600">
                Manage your health information and emergency contacts
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-green-100 text-green-800">
              <Heart className="h-3 w-3 mr-1" />
              Patient
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blood Type</CardTitle>
              <Heart className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-red-600">{patientData.bloodType}</div>
              <p className="text-xs text-muted-foreground">
                Emergency info
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Checkup</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-blue-600">Jan 10</div>
              <p className="text-xs text-muted-foreground">
                2024
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Insurance</CardTitle>
              <Shield className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-green-600">Active</div>
              <p className="text-xs text-muted-foreground">
                {patientData.insuranceProvider}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Emergency Contact</CardTitle>
              <Phone className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-orange-600">Ready</div>
              <p className="text-xs text-muted-foreground">
                {patientData.emergencyContact}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Profile Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Personal Info</TabsTrigger>
            <TabsTrigger value="medical">Medical Info</TabsTrigger>
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
                      value={patientData.fullName}
                      onChange={(e) => setPatientData(prev => ({ ...prev, fullName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={patientData.email}
                      onChange={(e) => setPatientData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={patientData.phone}
                      onChange={(e) => setPatientData(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={patientData.dateOfBirth}
                      onChange={(e) => setPatientData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={patientData.address}
                    onChange={(e) => setPatientData(prev => ({ ...prev, address: e.target.value }))}
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
                      value={patientData.emergencyContact}
                      onChange={(e) => setPatientData(prev => ({ ...prev, emergencyContact: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyPhone">Contact Phone</Label>
                    <Input
                      id="emergencyPhone"
                      type="tel"
                      value={patientData.emergencyPhone}
                      onChange={(e) => setPatientData(prev => ({ ...prev, emergencyPhone: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="medical" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Heart className="h-5 w-5 mr-2" />
                  Medical Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bloodType">Blood Type</Label>
                    <Input
                      id="bloodType"
                      value={patientData.bloodType}
                      onChange={(e) => setPatientData(prev => ({ ...prev, bloodType: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insuranceProvider">Insurance Provider</Label>
                    <Input
                      id="insuranceProvider"
                      value={patientData.insuranceProvider}
                      onChange={(e) => setPatientData(prev => ({ ...prev, insuranceProvider: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allergies">Allergies</Label>
                  <Textarea
                    id="allergies"
                    value={patientData.allergies}
                    onChange={(e) => setPatientData(prev => ({ ...prev, allergies: e.target.value }))}
                    placeholder="List any known allergies..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medicalConditions">Medical Conditions</Label>
                  <Textarea
                    id="medicalConditions"
                    value={patientData.medicalConditions}
                    onChange={(e) => setPatientData(prev => ({ ...prev, medicalConditions: e.target.value }))}
                    placeholder="List any ongoing medical conditions..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medications">Current Medications</Label>
                  <Textarea
                    id="medications"
                    value={patientData.medications}
                    onChange={(e) => setPatientData(prev => ({ ...prev, medications: e.target.value }))}
                    placeholder="List current medications and dosages..."
                    rows={2}
                  />
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
                        {key === 'emergencyAlerts' && 'Receive alerts for emergency situations'}
                        {key === 'appointmentReminders' && 'Get reminders for upcoming appointments'}
                        {key === 'medicationReminders' && 'Reminders to take medications'}
                        {key === 'healthTips' && 'Receive health tips and wellness advice'}
                        {key === 'systemUpdates' && 'Important system updates and changes'}
                        {key === 'marketingEmails' && 'Promotional emails and offers'}
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
                  Privacy & Preferences
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
                        {key === 'shareDataWithProviders' && 'Allow sharing medical data with healthcare providers'}
                        {key === 'allowEmergencyAccess' && 'Allow emergency responders to access your medical info'}
                        {key === 'receiveHealthReports' && 'Receive periodic health reports and summaries'}
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
                        className="w-48"
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
