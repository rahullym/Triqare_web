'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { useRole } from '@/hooks/useRole'
import { hasAccessToPath } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Shield, ArrowLeft, Home } from 'lucide-react'

interface DashboardAuthGuardProps {
  children: React.ReactNode
}

export function DashboardAuthGuard({ children }: DashboardAuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { authUser: user, appUser, loading } = useAuth()
  const { role } = useRole()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // User not authenticated, redirect to sign-in
        const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(pathname)}`
        router.push(signInUrl)
        return
      }

      if (!role) {
        // User authenticated but no role, redirect to dashboard for role assignment
        if (pathname !== '/dashboard') {
          router.push('/dashboard')
        }
        return
      }

      // Patient and driver are mobile-only — they have no web dashboard.
      // Send them straight to the mobile-app page instead of rendering a
      // half-built dashboard (avoids the dead nav links + wrong sidebar).
      if (role === 'patient' || role === 'driver') {
        if (pathname !== '/mobile-app-required') {
          router.push('/mobile-app-required')
        }
        return
      }

      // Check if user has access to current path
      if (!hasAccessToPath(role, pathname)) {
        // User doesn't have access, redirect to their default dashboard
        const defaultPaths = {
          admin: '/admin/dashboard',
          ert: '/erteam/dashboard',
          transport_company: '/transport/dashboard',
          patient: '/mobile-app-required', // Redirect patients to mobile app
          driver: '/mobile-app-required'   // Redirect drivers to mobile app
        }
        
        const defaultPath = defaultPaths[role] || '/dashboard'
        if (pathname !== defaultPath) {
          router.push(defaultPath)
        }
      }
    }
  }, [user, role, loading, pathname, router])

  // Show loading state while checking authentication and role
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  // User not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Authentication Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              You need to sign in to access the dashboard.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                onClick={() => router.push('/')}
                variant="outline"
              >
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Button>
              <Button 
                onClick={() => router.push('/sign-in')}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User authenticated but no role
  if (!role) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-orange-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Role Assignment Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="flex items-center justify-center space-x-2 text-amber-600 bg-amber-50 p-4 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Account Setup Pending</span>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-600">
                Welcome <strong>{appUser?.firstName || user.email}</strong>!
                Your account has been created successfully, but you need a role assigned to access the system.
              </p>
              
              <p className="text-sm text-gray-500">
                Please contact your system administrator to assign you a role, or if you're the first user, 
                you may need to set up your role through the admin interface.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                onClick={() => router.push('/')}
                variant="outline"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Home
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

  // User has role but no access to current path
  if (!hasAccessToPath(role, pathname)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Insufficient Permissions</span>
            </div>
            <p className="text-gray-600">
              You don't have permission to access this page. Your current role is: 
              <span className="font-semibold capitalize"> {role}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                onClick={() => router.push('/')}
                variant="outline"
              >
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Button>
              <Button 
                onClick={() => {
                  const defaultPaths = {
                    admin: '/admin/dashboard',
                    ert: '/erteam/dashboard',
                    transport_company: '/transport/dashboard',
                    patient: '/mobile-app-required',
                    driver: '/mobile-app-required'
                  }
                  router.push(defaultPaths[role] || '/dashboard')
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User has access, render children
  return <>{children}</>
}
