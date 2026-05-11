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
  Shield,
  Bell,
  Lock,
  Save,
  Settings,
  Users,
  Building2,
  BarChart3,
  Loader2,
  Camera,
  Upload,
  Trash2
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { DatabaseUser } from '@/lib/supabase'

export default function AdminProfilePage() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbUser, setDbUser] = useState<DatabaseUser | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Admin data from database
  const [adminData, setAdminData] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'System Administrator',
    department: '',
    employeeId: '',
    lastLogin: '',
    accountCreated: ''
  })

  const [notifications, setNotifications] = useState({
    systemAlerts: true,
    userRegistrations: true,
    emergencyNotifications: true,
    systemMaintenance: false,
    reportGeneration: true,
    dataExports: false
  })

  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: true,
    sessionTimeout: '30',
    loginNotifications: true,
    ipRestriction: false
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
          setAdminData({
            fullName: data.user.full_name || `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || '',
            email: data.user.email || '',
            phone: data.user.phone || '',
            role: 'System Administrator',
            department: data.user.department || 'Emergency Management',
            employeeId: data.user.employee_id || '',
            lastLogin: data.user.last_sign_in_at || '',
            accountCreated: data.user.created_at || ''
          })
        } else {
          // Fallback to Clerk data if database user doesn't exist
          setAdminData({
            fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: user.primaryEmailAddress?.emailAddress || '',
            phone: user.phoneNumbers?.[0]?.phoneNumber || '',
            role: 'System Administrator',
            department: 'Emergency Management',
            employeeId: '',
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
          first_name: adminData.fullName.split(' ')[0] || '',
          last_name: adminData.fullName.split(' ').slice(1).join(' ') || '',
          full_name: adminData.fullName,
          phone: adminData.phone,
          bio: `System Administrator in ${adminData.department}`,
          department: adminData.department,
          employee_id: adminData.employeeId,
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

  const handleSecurityChange = (key: string, value: boolean | string) => {
    setSecuritySettings(prev => ({ ...prev, [key]: value }))
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
      <RoleGuard allowedRoles={['admin']}>
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center">
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
    <RoleGuard allowedRoles={['admin']}>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Avatar className="w-16 h-16">
            <AvatarImage
              src={dbUser?.avatar_url || user?.imageUrl}
              alt={adminData.fullName || 'Admin'}
            />
            <AvatarFallback className="text-lg bg-gradient-to-br from-red-500 to-orange-600 text-white">
              {adminData.fullName ? adminData.fullName.split(' ').map(n => n[0]).join('').slice(0, 2) : 'AD'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              🛡️ Administrator Profile
            </h1>
            <p className="text-gray-600">
              Manage your administrator account and system preferences
            </p>
          </div>
        </div>
        <Badge variant="default" className="px-3 py-1">
          <Shield className="h-4 w-4 mr-1" />
          System Admin
        </Badge>
      </div>

      {/* Profile Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Account Status</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Active</div>
            <p className="text-xs text-muted-foreground">
              Full system access
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users Managed</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">156</div>
            <p className="text-xs text-muted-foreground">
              System users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">99.9%</div>
            <p className="text-xs text-muted-foreground">
              Uptime this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Login</CardTitle>
            <User className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-orange-600">Today</div>
            <p className="text-xs text-muted-foreground">
              {new Date(adminData.lastLogin).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Profile Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Profile Information</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security Settings</TabsTrigger>
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
              {/* Avatar Section */}
              <div className="flex items-center space-x-6 pb-6 border-b">
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage
                      src={dbUser?.avatar_url || user?.imageUrl}
                      alt={adminData.fullName || 'Admin'}
                    />
                    <AvatarFallback className="text-xl bg-gradient-to-br from-red-500 to-orange-600 text-white">
                      {adminData.fullName ? adminData.fullName.split(' ').map(n => n[0]).join('').slice(0, 2) : 'AD'}
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
                    {adminData.fullName || 'Administrator'}
                  </h3>
                  <p className="text-gray-600 mb-2">{adminData.role}</p>
                  <Badge className="bg-red-100 text-red-800 border-red-200">
                    <Shield className="w-3 h-3 mr-1" />
                    Administrator
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={adminData.fullName}
                    onChange={(e) => setAdminData(prev => ({ ...prev, fullName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input
                    id="employeeId"
                    value={adminData.employeeId}
                    onChange={(e) => setAdminData(prev => ({ ...prev, employeeId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={adminData.email}
                      onChange={(e) => setAdminData(prev => ({ ...prev, email: e.target.value }))}
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
                      value={adminData.phone}
                      onChange={(e) => setAdminData(prev => ({ ...prev, phone: e.target.value }))}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    value={adminData.role}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={adminData.department}
                    onChange={(e) => setAdminData(prev => ({ ...prev, department: e.target.value }))}
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
                    <Label>System Alerts</Label>
                    <p className="text-sm text-gray-600">Critical system notifications and alerts</p>
                  </div>
                  <Switch
                    checked={notifications.systemAlerts}
                    onCheckedChange={(checked) => handleNotificationChange('systemAlerts', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>User Registrations</Label>
                    <p className="text-sm text-gray-600">New user account registrations</p>
                  </div>
                  <Switch
                    checked={notifications.userRegistrations}
                    onCheckedChange={(checked) => handleNotificationChange('userRegistrations', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Emergency Notifications</Label>
                    <p className="text-sm text-gray-600">High-priority emergency alerts</p>
                  </div>
                  <Switch
                    checked={notifications.emergencyNotifications}
                    onCheckedChange={(checked) => handleNotificationChange('emergencyNotifications', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>System Maintenance</Label>
                    <p className="text-sm text-gray-600">Scheduled maintenance notifications</p>
                  </div>
                  <Switch
                    checked={notifications.systemMaintenance}
                    onCheckedChange={(checked) => handleNotificationChange('systemMaintenance', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Report Generation</Label>
                    <p className="text-sm text-gray-600">Automated report completion alerts</p>
                  </div>
                  <Switch
                    checked={notifications.reportGeneration}
                    onCheckedChange={(checked) => handleNotificationChange('reportGeneration', checked)}
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

        {/* Security Settings Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Security & Access Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-gray-600">Enhanced security with 2FA</p>
                  </div>
                  <Switch
                    checked={securitySettings.twoFactorAuth}
                    onCheckedChange={(checked) => handleSecurityChange('twoFactorAuth', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Login Notifications</Label>
                    <p className="text-sm text-gray-600">Email alerts for account access</p>
                  </div>
                  <Switch
                    checked={securitySettings.loginNotifications}
                    onCheckedChange={(checked) => handleSecurityChange('loginNotifications', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>IP Restriction</Label>
                    <p className="text-sm text-gray-600">Limit access to specific IP addresses</p>
                  </div>
                  <Switch
                    checked={securitySettings.ipRestriction}
                    onCheckedChange={(checked) => handleSecurityChange('ipRestriction', checked)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={securitySettings.sessionTimeout}
                    onChange={(e) => handleSecurityChange('sessionTimeout', e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <Button onClick={handleSaveProfile} disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Security Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-gray-500">Account Created</label>
                  <p className="font-medium">{new Date(adminData.accountCreated).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-gray-500">Last Login</label>
                  <p className="font-medium">{new Date(adminData.lastLogin).toLocaleString()}</p>
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
              This will permanently delete your account and all associated data including profile information, settings, and history. This action <strong>cannot be undone</strong>.
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
