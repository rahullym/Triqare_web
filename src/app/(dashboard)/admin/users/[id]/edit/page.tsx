'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Save,
  User,
  Mail,
  Shield,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  Users,
  LifeBuoy
} from 'lucide-react'
import Link from 'next/link'
import { DatabaseUser } from '@/lib/supabase'
import { UserTypeBadges } from '@/components/admin/UserTypeBadges'
import { UserTermsCard } from '@/components/admin/UserTermsCard'

interface LinkedPatient {
  id: string
  name: string | null
  email: string | null
  relationship: string | null
}

interface UserClassification {
  is_patient: boolean
  is_emergency_contact: boolean
  account_type: string
  linked_patients: LinkedPatient[]
}

export default function AdminUserEditPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string

  const [user, setUser] = useState<DatabaseUser | null>(null)
  const [classification, setClassification] = useState<UserClassification | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: '' as 'admin' | 'ert' | 'transport_company' | 'driver' | 'patient' | ''
  })

  // Load user data
  useEffect(() => {
    const loadUser = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const res = await fetch(`/api/users/${userId}`)
        const json = await res.json()
        const data: DatabaseUser | null = res.ok ? json.user : null
        const error: string | null = res.ok ? null : (json.error || 'Failed to load user')
        
        if (error) {
          throw new Error(error)
        }
        
        if (!data) {
          throw new Error('User not found')
        }
        
        setUser(data)
        setFormData({
          full_name: data.full_name || '',
          email: data.email || '',
          role: data.role || ''
        })
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user')
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      loadUser()
    }
  }, [userId])

  // Load user-type classification (flags + linked patients). Non-fatal: the page
  // still works if this fails, it just omits the User Type card.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const loadClassification = async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/classification`)
        if (!res.ok) return
        const data: UserClassification = await res.json()
        if (!cancelled) setClassification(data)
      } catch {
        // ignore — classification is supplementary
      }
    }
    loadClassification()
    return () => {
      cancelled = true
    }
  }, [userId])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    
    try {
      // Validate required fields
      if (!formData.full_name || !formData.email || !formData.role) {
        throw new Error('Please fill in all required fields')
      }

      const updateData = {
        full_name: formData.full_name,
        email: formData.email,
        role: formData.role
      }

      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      const json = await res.json()
      const data: DatabaseUser | null = res.ok && json.success ? json.user : null
      const error: string | null = res.ok && json.success ? null : (json.error || 'Failed to update user')
      
      if (error) {
        throw new Error(error)
      }

      setSuccess(true)
      setUser(data)
      
      setTimeout(() => {
        setSuccess(false)
      }, 3000)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return
    }

    setDeleting(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
      const json = await res.json()
      const error: string | null = res.ok && json.success ? null : (json.error || 'Failed to delete user')
      
      if (error) {
        throw new Error(error)
      }

      router.push('/admin/users')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 hover:bg-red-200'
      case 'ert': return 'bg-blue-100 text-blue-800 hover:bg-blue-200'
      case 'transport_company': return 'bg-green-100 text-green-800 hover:bg-green-200'
      case 'patient': return 'bg-purple-100 text-purple-800 hover:bg-purple-200'
      case 'driver': return 'bg-orange-100 text-orange-800 hover:bg-orange-200'
      default: return 'bg-gray-100 text-gray-800 hover:bg-gray-200'
    }
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrator'
      case 'ert': return 'Emergency Response Team'
      case 'transport_company': return 'Transport Company'
      case 'patient': return 'Patient'
      case 'driver': return 'Driver'
      default: return role
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">Loading user...</span>
        </div>
      </div>
    )
  }

  if (error && !user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading User</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={() => router.push('/admin/users')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Users
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/users">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit User</h1>
            <p className="text-gray-600">Update user information and role</p>
          </div>
        </div>
        {user && (
          <div className="flex items-center flex-wrap gap-2">
            <Badge className={getRoleBadgeColor(user.role)}>
              {getRoleDisplayName(user.role)}
            </Badge>
            {classification && (
              <UserTypeBadges
                is_patient={classification.is_patient}
                is_emergency_contact={classification.is_emergency_contact}
              />
            )}
            <span className="text-sm text-gray-500">
              ID: {user.id.slice(0, 8)}...
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success Message */}
        {success && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center text-green-800">
                <CheckCircle className="h-5 w-5 mr-2" />
                <span>User updated successfully!</span>
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

        {/* User Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              User Information
            </CardTitle>
            <CardDescription>Basic user details and contact information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="Enter full name"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter email address"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role & Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              Role & Permissions
            </CardTitle>
            <CardDescription>User role and access level</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role">User Role *</Label>
              <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="ert">Emergency Response Team</SelectItem>
                  <SelectItem value="transport_company">Transport Company</SelectItem>
                  <SelectItem value="patient">Patient</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* User Type Classification */}
        {classification && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                User Type
              </CardTitle>
              <CardDescription>
                Whether this account is a Patient, an Emergency Contact, or both —
                derived from the backend account flags.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <UserTypeBadges
                  is_patient={classification.is_patient}
                  is_emergency_contact={classification.is_emergency_contact}
                  showNone
                />
              </div>

              {!classification.is_patient && !classification.is_emergency_contact && (
                <p className="text-sm text-gray-500">
                  This account is neither a patient nor an emergency contact
                  (e.g. an administrator or staff role).
                </p>
              )}

              {/* Patients this person is an emergency contact for */}
              {classification.is_emergency_contact && (
                <div className="rounded-lg border bg-gray-50 p-4">
                  <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    <LifeBuoy className="h-4 w-4 mr-1.5 text-teal-600" />
                    Emergency contact for
                  </div>
                  {classification.linked_patients.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No linked patient found. This account was invited as an
                      emergency contact but is not currently matched to a
                      patient&apos;s contact list.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {classification.linked_patients.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <Link
                            href={`/admin/users/${p.id}/edit`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {p.name || p.email || 'Unknown patient'}
                          </Link>
                          {p.relationship && (
                            <Badge className="bg-gray-100 text-gray-700">
                              {p.relationship}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Terms & Conditions status + acceptance history (backend-sourced) */}
        {userId && <UserTermsCard userId={userId} />}

        {/* Actions */}
        <div className="flex justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {deleting ? 'Deleting...' : 'Delete User'}
          </Button>
          
          <div className="flex space-x-4">
            <Link href="/admin/users">
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={saving || success}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Saving...' : success ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
