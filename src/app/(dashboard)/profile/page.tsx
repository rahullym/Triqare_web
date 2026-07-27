'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const { authUser, role, loading: roleLoading } = useAuth()
  // Redirect to role-specific profile page
  useEffect(() => {
    if (!roleLoading) {
      if (!authUser) {
        router.push('/sign-in')
        return
      }

      if (role) {
        // Redirect to role-specific profile page
        const profilePaths = {
          admin: '/admin/profile',
          ert: '/erteam/profile',
          transport_company: '/transport/profile',
          patient: '/mobile-app-required', // Redirect patients to mobile app
          driver: '/mobile-app-required'   // Redirect drivers to mobile app
        }

        const profilePath = profilePaths[role]
        if (profilePath) {
          router.push(profilePath)
        }
      }
    }
  }, [role, roleLoading, authUser, router])

  // Show loading state while redirecting
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading your profile...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fallback for users without a specific role
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <p className="text-gray-600 mb-4">
            {!authUser ? 'Please sign in to view your profile.' : 'Unable to determine your role. Please contact support.'}
          </p>
          {!authUser && (
            <button
              onClick={() => router.push('/sign-in')}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Sign In
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
