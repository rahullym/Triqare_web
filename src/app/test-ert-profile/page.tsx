'use client'

import { useAuth } from '@/components/auth/AuthProvider'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function TestERTProfilePage() {
  const { authUser, appUser, role, loading: roleLoading } = useAuth()
  const [profileData, setProfileData] = useState<any>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const testProfileAccess = async () => {
    if (!authUser) return

    setTesting(true)
    setProfileError(null)

    try {
      // Test profile API access
      const response = await fetch('/api/profile')
      
      if (response.ok) {
        const data = await response.json()
        setProfileData(data)
      } else {
        const errorData = await response.text()
        setProfileError(`Profile API error: ${response.status} - ${errorData}`)
      }
    } catch (error) {
      setProfileError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    setTesting(false)
  }

  const testProfileUpdate = async () => {
    if (!authUser) return

    setTesting(true)

    try {
      const updateData = {
        phone: `+123456789${Math.floor(Math.random() * 10)}`,
        bio: `Test ERT profile update - ${new Date().toISOString()}`,
        department: 'Emergency Response Team',
        employee_id: `ERT${Math.floor(Math.random() * 1000)}`
      }

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        const result = await response.json()
        alert(`Profile update successful! Updated fields: ${Object.keys(updateData).join(', ')}`)
        // Refresh profile data
        testProfileAccess()
      } else {
        const errorData = await response.text()
        alert(`Profile update failed: ${response.status} - ${errorData}`)
      }
    } catch (error) {
      alert(`Profile update error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    setTesting(false)
  }

  if (roleLoading) {
    return <div className="p-6">Loading...</div>
  }

  if (!authUser) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>ERT Profile Test - Not Authenticated</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please sign in to test ERT profile functionality.</p>
            <a href="/sign-in" className="text-blue-600 hover:underline">Sign In</a>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ERT Profile Testing Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">Current User Info:</h3>
            <div className="bg-gray-100 p-3 rounded">
              <p><strong>Auth User ID:</strong> {authUser?.id}</p>
              <p><strong>Email:</strong> {appUser?.email ?? authUser?.email}</p>
              <p><strong>Name:</strong> {appUser?.firstName} {appUser?.lastName}</p>
              <p><strong>Role:</strong> {role || 'No role detected'}</p>
              <p><strong>Role Match:</strong> {role === 'ert' ? '✅ ERT Role Detected' : '❌ Not ERT Role'}</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold">Profile Page Access:</h3>
            <div className="flex gap-2 flex-wrap">
              <a 
                href="/erteam/profile" 
                className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                target="_blank"
              >
                Open ERT Profile Page
              </a>
              <Button onClick={testProfileAccess} disabled={testing}>
                {testing ? 'Testing...' : 'Test Profile API'}
              </Button>
              <Button onClick={testProfileUpdate} disabled={testing || !profileData}>
                {testing ? 'Updating...' : 'Test Profile Update'}
              </Button>
            </div>
          </div>

          {profileError && (
            <div className="bg-red-100 p-3 rounded">
              <h4 className="font-medium text-red-800">Profile Error:</h4>
              <p className="text-red-700 text-sm">{profileError}</p>
            </div>
          )}

          {profileData && (
            <div>
              <h3 className="font-semibold">Profile Data:</h3>
              <div className="bg-green-100 p-3 rounded">
                <p><strong>Database User Found:</strong> ✅ Yes</p>
                <p><strong>Full Name:</strong> {profileData.user?.full_name}</p>
                <p><strong>Email:</strong> {profileData.user?.email}</p>
                <p><strong>Phone:</strong> {profileData.user?.phone}</p>
                <p><strong>Role:</strong> {profileData.user?.role}</p>
                <p><strong>Department:</strong> {profileData.user?.department}</p>
                <p><strong>Employee ID:</strong> {profileData.user?.employee_id}</p>
                <p><strong>Bio:</strong> {profileData.user?.bio}</p>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold">Expected Behavior:</h3>
            <ul className="text-sm space-y-1">
              <li>• If you have ERT role: Profile page should load with your data</li>
              <li>• If you don't have ERT role: You should see "Access Denied" message</li>
              <li>• Profile API should return your user data from database</li>
              <li>• Profile updates should save to database successfully</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold">Troubleshooting:</h3>
            <div className="text-sm space-y-1">
              <p><strong>If profile page shows "Access Denied":</strong></p>
              <ul className="ml-4 space-y-1">
                <li>• Check that your Clerk role is set to "ert"</li>
                <li>• Verify your database user has role "ert"</li>
                <li>• Try signing out and signing back in</li>
              </ul>
              <p><strong>If profile data doesn't load:</strong></p>
              <ul className="ml-4 space-y-1">
                <li>• Check browser console for JavaScript errors</li>
                <li>• Verify API endpoint is accessible</li>
                <li>• Check network tab for failed requests</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
