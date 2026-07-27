'use client'

import { useAuth } from '@/components/auth/AuthProvider'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function TestProfilesPage() {
  const { authUser, appUser, role, loading: roleLoading } = useAuth()
  const [profileTests, setProfileTests] = useState<any[]>([])
  const [testing, setTesting] = useState(false)

  const testProfileAPI = async () => {
    if (!authUser) return

    setTesting(true)
    const tests = []

    try {
      // Test profile API
      const profileResponse = await fetch('/api/profile')
      const profileData = await profileResponse.json()

      tests.push({
        test: 'Profile API',
        success: profileResponse.ok,
        data: profileData,
        error: profileResponse.ok ? null : profileData.error
      })

      // Test role-specific profile pages (just the API calls they would make)
      if (role === 'ert') {
        tests.push({
          test: 'ERT Profile Data Mapping',
          success: true,
          data: {
            fullName: profileData.user?.full_name || `${profileData.user?.first_name || ''} ${profileData.user?.last_name || ''}`.trim() || '',
            email: profileData.user?.email || '',
            phone: profileData.user?.phone || '',
            role: 'Emergency Response Team Lead',
            badgeNumber: profileData.user?.employee_id || '',
            certifications: profileData.user?.special_certifications || '',
            yearsOfService: profileData.user?.years_experience || '',
            currentShift: profileData.user?.current_shift || '',
            lastLogin: profileData.user?.last_sign_in_at || '',
            accountCreated: profileData.user?.created_at || ''
          }
        })
      } else if (role === 'transport_company') {
        tests.push({
          test: 'Transport Profile Data Mapping',
          success: true,
          data: {
            companyName: profileData.user?.full_name || 'Transport Company',
            contactPerson: `${profileData.user?.first_name || ''} ${profileData.user?.last_name || ''}`.trim() || '',
            email: profileData.user?.email || '',
            phone: profileData.user?.phone || '',
            address: profileData.user?.address || '',
            registrationNumber: profileData.user?.registration_number || profileData.user?.employee_id || '',
            licenseNumber: profileData.user?.license_number || '',
            operatingHours: profileData.user?.operating_hours || profileData.user?.current_shift || '24/7',
            serviceArea: profileData.user?.service_area || profileData.user?.city || 'Metropolitan Area',
            lastLogin: profileData.user?.last_sign_in_at || '',
            accountCreated: profileData.user?.created_at || ''
          }
        })
      }

      // Test profile update
      const updateData = {
        phone: `+123456789${Math.floor(Math.random() * 10)}`,
        bio: `Test update from profile page - ${new Date().toISOString()}`,
        department: role === 'ert' ? 'Emergency Response Team' : 
                   role === 'transport_company' ? 'Transport Services' : 
                   role === 'admin' ? 'Emergency Management' : 'General'
      }

      const updateResponse = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })
      const updateResult = await updateResponse.json()

      tests.push({
        test: 'Profile Update',
        success: updateResponse.ok,
        data: updateResult,
        updateData: updateData,
        error: updateResponse.ok ? null : updateResult.error
      })

    } catch (error) {
      tests.push({
        test: 'Profile API Error',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    setProfileTests(tests)
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
            <CardTitle>Profile Testing - Not Authenticated</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please sign in to test profile functionality.</p>
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
          <CardTitle>Profile Testing Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">Current User Info:</h3>
            <div className="bg-gray-100 p-3 rounded">
              <p><strong>Auth User ID:</strong> {authUser?.id}</p>
              <p><strong>Email:</strong> {appUser?.email ?? authUser?.email}</p>
              <p><strong>Name:</strong> {appUser?.firstName} {appUser?.lastName}</p>
              <p><strong>Role:</strong> {role || 'No role detected'}</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold">Profile Page Links:</h3>
            <div className="flex gap-2 flex-wrap">
              <a href="/admin/profile" className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">
                Admin Profile
              </a>
              <a href="/erteam/profile" className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">
                ERT Profile
              </a>
              <a href="/transport/profile" className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600">
                Transport Profile
              </a>
              <a href="/driver/profile" className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600">
                Driver Profile
              </a>
              <a href="/patient/profile" className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                Patient Profile
              </a>
            </div>
          </div>

          <div>
            <Button onClick={testProfileAPI} disabled={testing}>
              {testing ? 'Testing...' : 'Test Profile API'}
            </Button>
          </div>

          {profileTests.length > 0 && (
            <div>
              <h3 className="font-semibold">Test Results:</h3>
              {profileTests.map((test, index) => (
                <div key={index} className={`p-3 rounded mb-2 ${test.success ? 'bg-green-100' : 'bg-red-100'}`}>
                  <h4 className="font-medium">{test.test}</h4>
                  <p className={test.success ? 'text-green-700' : 'text-red-700'}>
                    {test.success ? '✅ Success' : '❌ Failed'}
                  </p>
                  {test.error && <p className="text-red-600 text-sm">Error: {test.error}</p>}
                  {test.data && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm">View Data</summary>
                      <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(test.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
