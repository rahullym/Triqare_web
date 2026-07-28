'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Smartphone, Download, QrCode, LogOut, ArrowRight } from 'lucide-react'
import { UserRole } from '@/types'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appLinks'

interface MobileAppRedirectProps {
  role: UserRole
  userName?: string
}

export function MobileAppRedirect({ role, userName }: MobileAppRedirectProps) {
  const router = useRouter()
  const { signOut } = useAuth()

  const roleConfig = {
    patient: {
      title: 'Patient Mobile App Required',
      subtitle: 'Access your emergency services on mobile',
      description: 'For the best emergency response experience, patients should use our dedicated mobile application.',
      features: [
        'One-tap emergency SOS alerts',
        'Real-time ambulance tracking',
        'Medical profile management',
        'Emergency contact notifications',
        'Location-based services'
      ],
      appStoreUrl: APP_STORE_URL,
      playStoreUrl: PLAY_STORE_URL,
      icon: '🏥',
      color: 'bg-blue-600 hover:bg-blue-700'
    },
    driver: {
      title: 'Driver Mobile App Required',
      subtitle: 'Manage your ambulance operations on mobile',
      description: 'Drivers need the mobile app for real-time navigation, job assignments, and emergency communications.',
      features: [
        'Real-time job assignments',
        'GPS navigation to patients',
        'Emergency communication system',
        'Vehicle status updates',
        'Route optimization'
      ],
      appStoreUrl: APP_STORE_URL,
      playStoreUrl: PLAY_STORE_URL,
      icon: '🚑',
      color: 'bg-green-600 hover:bg-green-700'
    }
  }

  const config = roleConfig[role as keyof typeof roleConfig]

  // Hook must run on every render (Rules of Hooks). The redirect logic is guarded
  // inside the effect body so it only fires for roles without a mobile-app config.
  useEffect(() => {
    if (config) return
    // Fallback for other roles - redirect to appropriate dashboard
    const dashboardPaths = {
      admin: '/admin/dashboard',
      ert: '/erteam/dashboard',
      transport_company: '/transport/dashboard'
    }
    const path = dashboardPaths[role as keyof typeof dashboardPaths]
    if (path) {
      router.push(path)
    }
  }, [config, role, router])

  if (!config) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full shadow-xl">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mb-6">
            <span className="text-4xl">{config.icon}</span>
          </div>
          <CardTitle className="text-3xl font-bold text-gray-900 mb-2">
            {config.title}
          </CardTitle>
          <p className="text-lg text-gray-600">
            {config.subtitle}
          </p>
          {userName && (
            <p className="text-sm text-gray-500 mt-2">
              Welcome, <span className="font-semibold">{userName}</span>
            </p>
          )}
        </CardHeader>
        
        <CardContent className="space-y-8">
          {/* Description */}
          <div className="text-center">
            <p className="text-gray-700 leading-relaxed">
              {config.description}
            </p>
          </div>

          {/* Features */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
              <Smartphone className="w-5 h-5 mr-2 text-blue-600" />
              Mobile App Features:
            </h3>
            <ul className="space-y-2">
              {config.features.map((feature, index) => (
                <li key={index} className="flex items-center text-gray-700">
                  <ArrowRight className="w-4 h-4 mr-3 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Download Buttons — official app stores only */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 text-center flex items-center justify-center">
              <Download className="w-5 h-5 mr-2 text-blue-600" />
              Download the App:
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => window.open(config.playStoreUrl, '_blank')}
                className={`${config.color} text-white px-6 py-3 text-lg`}
              >
                <Download className="w-5 h-5 mr-2" />
                Google Play
              </Button>

              <Button
                onClick={() => window.open(config.appStoreUrl, '_blank')}
                className={`${config.color} text-white px-6 py-3 text-lg`}
              >
                <Download className="w-5 h-5 mr-2" />
                App Store
              </Button>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="text-center bg-white rounded-lg p-6 border-2 border-dashed border-gray-300">
            <QrCode className="w-16 h-16 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 text-sm">
              Scan QR code with your phone camera to download the app
            </p>
            <p className="text-xs text-gray-500 mt-2">
              (QR code generation coming soon)
            </p>
          </div>

          {/* Sign Out Option */}
          <div className="pt-6 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Button 
                onClick={() => router.push('/')}
                variant="outline"
                className="w-full sm:w-auto"
              >
                Back to Home
              </Button>
              
              <Button
                variant="outline"
                className="w-full sm:w-auto text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => signOut()}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
