'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, ArrowRight } from 'lucide-react'
import { Logo } from '@/components/ui/logo'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam))
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Logo size="xl" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Confirm Your Email</h1>
            <p className="text-gray-600 mt-2">
              We&apos;ve sent a confirmation link to{' '}
              <span className="font-medium text-gray-900">{email || 'your email address'}</span>
            </p>
          </div>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center space-x-2">
              <Mail className="h-5 w-5 text-blue-600" />
              <span>Check Your Inbox</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-gray-600 text-center">
              Click the confirmation link in that email to finish signing up. Once
              confirmed, you can sign in to access your dashboard.
            </p>

            <Button asChild className="w-full">
              <Link href="/sign-in">
                Back to sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                Didn&apos;t get the email? Check your spam folder, or{' '}
                <a href="/contact" className="font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200">
                  contact support
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Open the email we just sent you</li>
            <li>• Click the confirmation link to verify your address</li>
            <li>• Sign in to finish setting up your account</li>
            <li>• Start using Emergency Response services</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
