'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getBrowserSupabase } from '@/lib/supabase/browser'
import { useRole } from '@/hooks/useRole'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Edit3,
  Save,
  X,
  Camera,
  Database,
  RefreshCw,
  Heart,
  Briefcase,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import { DatabaseUser } from '@/lib/supabase'

export default function EnhancedProfilePage() {
  const { authUser, loading: authLoading } = useAuth()
  const { role, loading: roleLoading } = useRole()
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dbUser, setDbUser] = useState<DatabaseUser | null>(null)
  const [loadingDbUser, setLoadingDbUser] = useState(true)

  // Enhanced form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    bio: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    medicalConditions: '',
    allergies: '',
    medications: '',
    bloodType: '',
    department: '',
    position: '',
    employeeId: '',
  })

  // Populate the form from a database user row
  const populateForm = (data: DatabaseUser) => {
    setFormData({
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      phone: data.phone || '',
      bio: data.bio || '',
      dateOfBirth: data.date_of_birth || '',
      gender: data.gender || '',
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      zipCode: data.zip_code || '',
      country: data.country || 'United States',
      emergencyContactName: data.emergency_contact_name || '',
      emergencyContactPhone: data.emergency_contact_phone || '',
      emergencyContactRelationship: data.emergency_contact_relationship || '',
      medicalConditions: data.medical_conditions || '',
      allergies: data.allergies || '',
      medications: data.medications || '',
      bloodType: data.blood_type || '',
      department: data.department || '',
      position: data.position || '',
      employeeId: data.employee_id || '',
    })
  }

  // Load the signed-in user's database profile (RLS scopes this to their own row).
  const loadDbUser = async () => {
    if (!authUser?.id) return

    setLoadingDbUser(true)
    try {
      const supabase = getBrowserSupabase()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle()

      if (error) {
        console.error('Error loading database user:', error)
        toast.error('Failed to load profile data')
      } else {
        const profile = (data as DatabaseUser | null)
        setDbUser(profile)
        if (profile) {
          populateForm(profile)
        }
      }
    } catch (error) {
      console.error('Error loading database user:', error)
      toast.error('Failed to load profile data')
    } finally {
      setLoadingDbUser(false)
    }
  }

  // Load the profile once the auth session has resolved.
  useEffect(() => {
    if (authLoading) return
    if (authUser) {
      loadDbUser()
    } else {
      setLoadingDbUser(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, authLoading])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    if (!authUser || !dbUser) return

    setSaving(true)
    try {
      const supabase = getBrowserSupabase()
      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.firstName,
          last_name: formData.lastName,
          full_name: [formData.firstName, formData.lastName].filter(Boolean).join(' '),
          phone: formData.phone,
          bio: formData.bio,
          date_of_birth: formData.dateOfBirth || null,
          gender: formData.gender || null,
          address: formData.address || null,
          city: formData.city || null,
          state: formData.state || null,
          zip_code: formData.zipCode || null,
          country: formData.country || null,
          emergency_contact_name: formData.emergencyContactName || null,
          emergency_contact_phone: formData.emergencyContactPhone || null,
          emergency_contact_relationship: formData.emergencyContactRelationship || null,
          medical_conditions: formData.medicalConditions || null,
          allergies: formData.allergies || null,
          medications: formData.medications || null,
          blood_type: formData.bloodType || null,
          department: formData.department || null,
          position: formData.position || null,
          employee_id: formData.employeeId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dbUser.id)

      if (error) {
        toast.error(`Failed to update profile: ${error.message}`)
        return
      }

      toast.success('Profile updated successfully!')
      setIsEditing(false)
      await loadDbUser() // Reload to get fresh data
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form data to the last-loaded database values
    if (dbUser) {
      populateForm(dbUser)
    }
    setIsEditing(false)
  }

  if (authLoading || roleLoading || loadingDbUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!authUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Please sign in to view your profile.</p>
        </div>
      </div>
    )
  }

  const getRoleBadgeColor = (userRole: string) => {
    switch (userRole) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200'
      case 'ert': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'transport_company': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'driver': return 'bg-green-100 text-green-800 border-green-200'
      case 'patient': return 'bg-purple-100 text-purple-800 border-purple-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || ''
    const last = lastName?.charAt(0) || ''
    return (first + last).toUpperCase() || 'U'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Profile</h1>
          <p className="text-gray-600">Manage your personal information and preferences</p>
        </div>

        {/* Database Status */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>Profile Data Status</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                dbUser ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  dbUser ? 'bg-green-500' : 'bg-yellow-500'
                }`}></div>
                <span>{dbUser ? 'Profile loaded from database' : 'No database profile found'}</span>
              </div>
              {dbUser && (
                <p className="text-sm text-gray-600">
                  Last updated: {new Date(dbUser.updated_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rest of the profile content will be added in the next part */}
      </div>
    </div>
  )
}
