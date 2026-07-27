'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { getDefaultDashboardPath } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Shield, Truck, ArrowRight, Home, LogOut } from 'lucide-react'

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
        
        // Add a small delay to show the loading state
        setTimeout(() => {
          router.push(dashboardPath)
        }, 1000)
      }
      // If no role, show role selection interface
    }
  }, [role, loading, authUser, router])

  // Show loading state while checking authentication and role
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading your profile...</p>
        </div>
      </div>
    )
  }

  // Show redirecting state
  if (redirecting && role) {
    const dashboardNames = {
      admin: 'Admin Dashboard',
      ert: 'Emergency Response Dashboard',
      transport_company: 'Transport Dashboard',
      patient: 'Patient Dashboard',
      driver: 'Driver Dashboard'
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md">
          <div className="animate-pulse">
            <div className="mx-auto w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mb-6">
              <ArrowRight className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Welcome!</h2>
            <p className="text-gray-600">
              Redirecting to your <strong>{dashboardNames[role] || 'Dashboard'}</strong>...
            </p>
          </div>
          <div className="flex items-center justify-center space-x-2 text-green-600">
            <div className="animate-bounce w-2 h-2 bg-green-600 rounded-full"></div>
            <div className="animate-bounce w-2 h-2 bg-green-600 rounded-full" style={{ animationDelay: '0.1s' }}></div>
            <div className="animate-bounce w-2 h-2 bg-green-600 rounded-full" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      </div>
    )
  }

  // User is authenticated but has no role assigned
  if (authUser && !role) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-orange-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Account Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="flex items-center justify-center space-x-2 text-amber-600 bg-amber-50 p-4 rounded-lg border border-amber-200">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Role Assignment Pending</span>
            </div>

            <div className="space-y-4">
              <p className="text-gray-600">
                Welcome <strong>{appUser?.firstName || appUser?.email || authUser?.email}</strong>!
                Your account has been created successfully, but you need a role assigned to access the system.
              </p>

              <div className="bg-white p-6 rounded-lg border shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Available Roles:</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-center space-x-2 p-3 bg-red-50 rounded border border-red-200">
                    <Shield className="w-4 h-4 text-red-600" />
                    <span className="font-medium">System Administrator</span>
                  </div>
                  <div className="flex items-center space-x-2 p-3 bg-orange-50 rounded border border-orange-200">
                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                    <span className="font-medium">Emergency Response Team</span>
                  </div>
                  <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded border border-blue-200">
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Transport Company</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">💡 Quick Setup</h4>
                <p className="text-sm text-blue-800">
                  If you used an email with <strong>admin</strong>, <strong>ert</strong>, or <strong>transport</strong> in it, 
                  your role should be assigned automatically. Try refreshing the page.
                </p>
              </div>

              <p className="text-sm text-gray-500">
                If you continue to see this message, please contact your system administrator 
                or use the admin interface to assign roles.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => router.push('/')}
                variant="outline"
                className="flex items-center space-x-2"
              >
                <Home className="w-4 h-4" />
                <span>Go Home</span>
              </Button>
              <Button variant="outline" className="flex items-center space-x-2" onClick={() => signOut()}>
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 flex items-center space-x-2"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Refresh Status</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fallback - should not reach here
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-gray-600">Something went wrong. Please try again.</p>
        <Button onClick={() => router.push('/')}>Go Home</Button>
      </div>
    </div>
  )
}
