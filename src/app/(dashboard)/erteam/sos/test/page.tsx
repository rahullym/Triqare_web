'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  User,
  Database,
  Loader2
} from 'lucide-react'

export default function SOSTestPage() {
  const { authUser, appUser, role, loading } = useAuth()
  const [apiTest, setApiTest] = useState<{
    loading: boolean
    success: boolean
    error: string | null
    data: any
  }>({
    loading: false,
    success: false,
    error: null,
    data: null
  })

  const testAPI = async () => {
    setApiTest({ loading: true, success: false, error: null, data: null })
    
    try {
      const response = await fetch('/api/sos-requests?limit=5')
      
      // Check if response is HTML (redirect to login)
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('text/html')) {
        throw new Error('API returned HTML instead of JSON - likely authentication issue')
      }
      
      const result = await response.json()
      
      if (response.ok) {
        setApiTest({
          loading: false,
          success: true,
          error: null,
          data: result
        })
      } else {
        setApiTest({
          loading: false,
          success: false,
          error: result.error || `HTTP ${response.status}`,
          data: result
        })
      }
    } catch (error) {
      setApiTest({
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null
      })
    }
  }

  const testDatabase = async () => {
    try {
      const response = await fetch('/api/debug/test-sos-system')
      
      // Check if response is HTML (redirect to login)
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('text/html')) {
        alert('Database test returned HTML - authentication required')
        return
      }
      
      const result = await response.json()
      
      if (response.ok) {
        alert(`Database test: ${result.message}`)
      } else {
        alert(`Database test failed: ${result.error}`)
      }
    } catch (error) {
      alert(`Database test error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          🧪 SOS System Test Page
        </h1>
        <p className="text-gray-600">
          Test authentication and API connectivity for the SOS system
        </p>
      </div>

      {/* Authentication Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Authentication Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {authUser ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-green-700">Authenticated</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Name:</span> {appUser?.fullName || 'Not set'}
                </div>
                <div>
                  <span className="font-medium">Email:</span> {appUser?.email ?? authUser?.email}
                </div>
                <div>
                  <span className="font-medium">User ID:</span> {authUser?.id}
                </div>
                <div>
                  <span className="font-medium">Role:</span> {role || 'Not set'}
                </div>
              </div>
              {role !== 'ert' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-yellow-800 text-sm">
                      Warning: Your role is not 'ert'. You may not have access to ERT features.
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-700">Not authenticated</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>SOS API Test</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Button 
              onClick={testAPI} 
              disabled={apiTest.loading}
              className="flex items-center space-x-2"
            >
              {apiTest.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              <span>Test SOS API</span>
            </Button>
            
            <Button 
              onClick={testDatabase}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Database className="h-4 w-4" />
              <span>Test Database</span>
            </Button>
          </div>

          {/* API Test Results */}
          {(apiTest.success || apiTest.error) && (
            <div className="mt-4">
              <div className="flex items-center space-x-2 mb-2">
                {apiTest.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className={apiTest.success ? 'text-green-700' : 'text-red-700'}>
                  {apiTest.success ? 'API Test Passed' : 'API Test Failed'}
                </span>
              </div>
              
              {apiTest.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="text-red-800 text-sm font-medium">Error:</div>
                  <div className="text-red-700 text-sm">{apiTest.error}</div>
                </div>
              )}
              
              {apiTest.data && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <div className="text-gray-800 text-sm font-medium mb-2">Response Data:</div>
                  <pre className="text-xs text-gray-600 overflow-auto max-h-40">
                    {JSON.stringify(apiTest.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">1</div>
              <div>
                <div className="font-medium">Check Authentication</div>
                <div className="text-gray-600">Make sure you're logged in and have the correct role</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">2</div>
              <div>
                <div className="font-medium">Test API Connectivity</div>
                <div className="text-gray-600">Click "Test SOS API" to check if the endpoints are working</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">3</div>
              <div>
                <div className="font-medium">Test Database</div>
                <div className="text-gray-600">Click "Test Database" to verify database connectivity</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">4</div>
              <div>
                <div className="font-medium">Check Browser Console</div>
                <div className="text-gray-600">Open browser dev tools and check for JavaScript errors</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <Button 
              onClick={() => window.location.href = '/erteam/sos'}
              variant="outline"
            >
              Go to SOS Page
            </Button>
            <Button 
              onClick={() => window.location.href = '/dashboard'}
              variant="outline"
            >
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
