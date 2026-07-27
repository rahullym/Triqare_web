'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { getDefaultDashboardPath } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Shield, Truck, LogOut } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { authUser, appUser, role, loading, signOut } = useAuth()
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    if (!loading) {
      if (!authUser) {
        // User not authenticated, redirect to sign-in
        router.push('/sign-in')
        return
      }

      if (role) {
        // User has a role, redirect to appropriate dashboard
        setRedirecting(true)
        const dashboardPath = getDefaultDashboardPath(role)
        router.push(dashboardPath)
      }
      // If no role, show role selection interface
    }
  }, [role, loading, authUser, router])

  // Show loading state while checking authentication and role
  if (loading || redirecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">
            {redirecting ? 'Redirecting to your dashboard...' : 'Loading your profile...'}
          </p>
        </div>
      </div>
    )
  }

  // User is authenticated but has no role assigned
  if (authUser && !role) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-orange-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Account Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="flex items-center justify-center space-x-2 text-amber-600 bg-amber-50 p-4 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Role Assignment Pending</span>
            </div>

            <div className="space-y-4">
              <p className="text-gray-600">
                Welcome <strong>{appUser?.firstName || appUser?.email || authUser?.email}</strong>!
                Your account has been created successfully, but you need a role assigned to access the system.
              </p>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Available Roles:</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-center space-x-2 p-2 bg-white rounded border">
                    <Shield className="w-4 h-4 text-red-600" />
                    <span>System Administrator</span>
                  </div>
                  <div className="flex items-center space-x-2 p-2 bg-white rounded border">
                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                    <span>Emergency Response Team</span>
                  </div>
                  <div className="flex items-center space-x-2 p-2 bg-white rounded border">
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span>Transport Company</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Please contact your system administrator to assign you a role, or if you're the first user,
                you may need to set up your role through the admin interface.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" className="flex items-center space-x-2" onClick={() => signOut()}>
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Refresh Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fallback - should not reach here
  return null
}
