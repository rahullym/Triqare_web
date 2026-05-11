'use client'

import { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  AlertTriangle,
  Bell,
  Lock,
  Save,
  Activity,
  Clock,
  MapPin,
  FileText,
  Loader2,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { DatabaseUser } from '@/lib/supabase'

export default function ERTProfilePage() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbUser, setDbUser] = useState<DatabaseUser | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // ERT member data from database
  const [ertData, setErtData] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'Emergency Response Team Lead',
    badgeNumber: '',
    certifications: '',
    yearsOfService: '',
    currentShift: '',
    lastLogin: '',
    accountCreated: ''
  })

  const [notifications, setNotifications] = useState({
    emergencyAlerts: true,
    sosNotifications: true,
    shiftReminders: true,
    trainingUpdates: false,
    systemUpdates: true,
    weatherAlerts: true
  })

  const [preferences, setPreferences] = useState({
    autoAcceptAssignments: false,
    locationSharing: true,
    soundAlerts: true,
    vibrationAlerts: true,
    darkMode: false
  })

  // Fetch user profile from database
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return

      try {
        const response = await fetch('/api/profile')
        if (response.ok) {
          const data = await response.json()
          setDbUser(data.user)

          // Initialize form data with database values
          setErtData({
            fullName: data.user.full_name || `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || '',
            email: data.user.email || '',
            phone: data.user.phone || '',
            role: 'Emergency Response Team Lead',
            badgeNumber: data.user.employee_id || '',
            certifications: 'Emergency Response, First Aid, CPR', // Default value since special_certifications doesn't exist in DB
            yearsOfService: '5', // Default value since years_experience doesn't exist in DB
            currentShift: 'Day Shift', // Default value since current_shift doesn't exist in DB
            lastLogin: data.user.last_sign_in_at || '',
            accountCreated: data.user.created_at || ''
          })
        } else {
          // Fallback to Clerk data if database user doesn't exist
          setErtData({
            fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: user.primaryEmailAddress?.emailAddress || '',
            phone: user.phoneNumbers?.[0]?.phoneNumber || '',
            role: 'Emergency Response Team Lead',
            badgeNumber: '',
            certifications: 'Emergency Response, First Aid, CPR', // Default value since special_certifications doesn't exist in DB
            yearsOfService: '5', // Default value since years_experience doesn't exist in DB
            currentShift: 'Day Shift', // Default value since current_shift doesn't exist in DB
            lastLogin: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : '',
            accountCreated: user.createdAt ? new Date(user.createdAt).toISOString() : ''
          })
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        toast.error('Failed to load profile data')
      } finally {
        setLoading(false)
      }
    }

    if (user && isLoaded) {
      fetchProfile()
    }
  }, [user, isLoaded])

  const handleSaveProfile = async () => {
    setIsLoading(true)
    try {
      // Update profile in database
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: ertData.fullName.split(' ')[0] || '',
          last_name: ertData.fullName.split(' ').slice(1).join(' ') || '',
          full_name: ertData.fullName,
          phone: ertData.phone,
          bio: `ERT Team Lead with ${ertData.yearsOfService} years of service`,
          employee_id: ertData.badgeNumber,
          // Skip fields that don't exist in the database schema
          // special_certifications: ertData.certifications,
          // years_experience: ertData.yearsOfService,
          // current_shift: ertData.currentShift,
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

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }))
  }

  const handlePreferenceChange = (key: string, value: boolean) => {
    setPreferences(prev => ({ ...prev, [key]: value }))
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
      <RoleGuard allowedRoles={['ert']}>
        <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-100 flex items-center justify-center">
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
    <RoleGuard allowedRoles={['ert']}>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            🚨 ERT Member Profile
          </h1>
          <p className="text-gray-600">
            Manage your emergency response team profile and preferences
          </p>
        </div>
        <Badge variant="default" className="px-3 py-1">
          <AlertTriangle className="h-4 w-4 mr-1" />
          ERT Team Lead
        </Badge>
      </div>

      {/* Profile Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">On Duty</div>
            <p className="text-xs text-muted-foreground">
              Available for assignments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Responses Today</CardTitle>
            <AlertTriangle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">7</div>
            <p className="text-xs text-muted-foreground">
              Emergency calls
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Years of Service</CardTitle>
            <Clock className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{ertData.yearsOfService}</div>
            <p className="text-xs text-muted-foreground">
              Years experience
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Location</CardTitle>
            <MapPin className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-orange-600">Station 1</div>
            <p className="text-xs text-muted-foreground">
              Downtown HQ
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Profile Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Profile Information</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        {/* Profile Information Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={ertData.fullName}
                    onChange={(e) => setErtData(prev => ({ ...prev, fullName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badgeNumber">Badge Number</Label>
                  <Input
                    id="badgeNumber"
                    value={ertData.badgeNumber}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={ertData.email}
                      onChange={(e) => setErtData(prev => ({ ...prev, email: e.target.value }))}
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
                      value={ertData.phone}
                      onChange={(e) => setErtData(prev => ({ ...prev, phone: e.target.value }))}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    value={ertData.role}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currentShift">Current Shift</Label>
                  <Input
                    id="currentShift"
                    value={ertData.currentShift}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="certifications">Certifications</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="certifications"
                    value={ertData.certifications}
                    onChange={(e) => setErtData(prev => ({ ...prev, certifications: e.target.value }))}
                    className="pl-10"
                    placeholder="EMT-Paramedic, ACLS, PALS, CPR"
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
                Emergency Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
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
                    <Label>SOS Notifications</Label>
                    <p className="text-sm text-gray-600">Incoming SOS calls and requests</p>
                  </div>
                  <Switch
                    checked={notifications.sosNotifications}
                    onCheckedChange={(checked) => handleNotificationChange('sosNotifications', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Shift Reminders</Label>
                    <p className="text-sm text-gray-600">Shift start and end notifications</p>
                  </div>
                  <Switch
                    checked={notifications.shiftReminders}
                    onCheckedChange={(checked) => handleNotificationChange('shiftReminders', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Training Updates</Label>
                    <p className="text-sm text-gray-600">Training schedules and requirements</p>
                  </div>
                  <Switch
                    checked={notifications.trainingUpdates}
                    onCheckedChange={(checked) => handleNotificationChange('trainingUpdates', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Weather Alerts</Label>
                    <p className="text-sm text-gray-600">Severe weather notifications</p>
                  </div>
                  <Switch
                    checked={notifications.weatherAlerts}
                    onCheckedChange={(checked) => handleNotificationChange('weatherAlerts', checked)}
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

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Response Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-Accept Assignments</Label>
                    <p className="text-sm text-gray-600">Automatically accept emergency assignments</p>
                  </div>
                  <Switch
                    checked={preferences.autoAcceptAssignments}
                    onCheckedChange={(checked) => handlePreferenceChange('autoAcceptAssignments', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Location Sharing</Label>
                    <p className="text-sm text-gray-600">Share real-time location with dispatch</p>
                  </div>
                  <Switch
                    checked={preferences.locationSharing}
                    onCheckedChange={(checked) => handlePreferenceChange('locationSharing', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Sound Alerts</Label>
                    <p className="text-sm text-gray-600">Audio notifications for emergencies</p>
                  </div>
                  <Switch
                    checked={preferences.soundAlerts}
                    onCheckedChange={(checked) => handlePreferenceChange('soundAlerts', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Vibration Alerts</Label>
                    <p className="text-sm text-gray-600">Vibration notifications for emergencies</p>
                  </div>
                  <Switch
                    checked={preferences.vibrationAlerts}
                    onCheckedChange={(checked) => handlePreferenceChange('vibrationAlerts', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Dark Mode</Label>
                    <p className="text-sm text-gray-600">Use dark theme for better visibility</p>
                  </div>
                  <Switch
                    checked={preferences.darkMode}
                    onCheckedChange={(checked) => handlePreferenceChange('darkMode', checked)}
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <Button onClick={handleSaveProfile} disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Service Information */}
          <Card>
            <CardHeader>
              <CardTitle>Service Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-gray-500">Years of Service</label>
                  <p className="font-medium">{ertData.yearsOfService} years</p>
                </div>
                <div>
                  <label className="text-gray-500">Account Created</label>
                  <p className="font-medium">{new Date(ertData.accountCreated).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-gray-500">Last Login</label>
                  <p className="font-medium">{new Date(ertData.lastLogin).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-gray-500">Current Shift</label>
                  <p className="font-medium">{ertData.currentShift}</p>
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
                  <p className="text-sm text-gray-600">Permanently delete your account and all associated data. This action cannot be undone.</p>
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
              This will permanently delete your account and all associated data including profile information, certifications, and history. This action <strong>cannot be undone</strong>.
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
