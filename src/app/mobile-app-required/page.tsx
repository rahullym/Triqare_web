'use client'

import { useAuth } from '@/components/auth/AuthProvider'
import { MobileAppRedirect } from '@/components/auth/MobileAppRedirect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function MobileAppRequiredPage() {
  const { authUser, appUser, role, loading } = useAuth()

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-semibold text-gray-900">
              Loading...
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="text-gray-600 mt-4">
              Checking your account details
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // If no user, redirect to sign-in (this should be handled by middleware)
  if (!authUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-semibold text-gray-900">
              Authentication Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600">
              Please sign in to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // If no role, show role assignment message
  if (!role) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-semibold text-gray-900">
              Role Assignment Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600">
              Your account role is being configured. Please contact an administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Only show mobile app redirect for patient and driver roles
  if (role === 'patient' || role === 'driver') {
    const userName = appUser?.firstName
      ? `${appUser.firstName} ${appUser.lastName || ''}`.trim()
      : (appUser?.email ?? authUser.email)

    return <MobileAppRedirect role={role} userName={userName} />
  }

  // For other roles, show a message that they shouldn't be here
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold text-gray-900">
            Incorrect Access
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">
            This page is only for patients and drivers. Your role is: <span className="font-semibold capitalize">{role}</span>
          </p>
          <p className="text-sm text-gray-500">
            You will be redirected to your appropriate dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
