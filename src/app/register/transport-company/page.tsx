'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, User, Mail, Phone, Building, MapPin, FileText, Calendar, Truck } from 'lucide-react'
import { Logo } from '@/components/ui/logo'

interface TransportCompanyFormData {
  // Basic Info
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  phone: string

  // Company Info
  companyName: string
  registrationNumber: string
  addressLine: string
  licenseValidTill: string

  // Location (optional for now)
  countryId: string
  stateId: string
  cityId: string
  pincodeId: string
}

interface FormErrors {
  [key: string]: string
}

export default function TransportCompanyRegistration() {
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 3
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState<TransportCompanyFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    companyName: '',
    registrationNumber: '',
    addressLine: '',
    licenseValidTill: '',
    countryId: '',
    stateId: '',
    cityId: '',
    pincodeId: ''
  })

  const [errors, setErrors] = useState<FormErrors>({})

  const handleInputChange = (field: keyof TransportCompanyFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateStep = (step: number): boolean => {
    const newErrors: FormErrors = {}

    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required'
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required'
      if (!formData.email.trim()) newErrors.email = 'Email is required'
      else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid'
      if (!formData.password) newErrors.password = 'Password is required'
      else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters'
      if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password'
      else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
      if (!formData.phone.trim()) newErrors.phone = 'Phone number is required'
    }

    if (step === 2) {
      if (!formData.companyName.trim()) newErrors.companyName = 'Company name is required'
      if (!formData.registrationNumber.trim()) newErrors.registrationNumber = 'Registration number is required'
      if (!formData.addressLine.trim()) newErrors.addressLine = 'Address is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps))
    }
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    setIsLoading(true)

    try {
      // Create the Supabase auth user. A Postgres trigger (handle_new_auth_user)
      // creates the public.users row automatically and links any pre-existing row
      // by email — so the client must NOT set a privileged role here; the `data`
      // below is display-only metadata. The transport_company role is applied by
      // the domain API / admin verification flow, not from the browser.
      const supabase = getBrowserSupabase()
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect_url=/dashboard`,
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            full_name: `${formData.firstName} ${formData.lastName}`,
          },
        },
      })

      if (error) {
        toast.error(error.message || 'Registration failed. Please try again.')
        return
      }

      const authUserId = data.user?.id

      // Create the domain (transport_companies) record via API.
      // Defense-in-depth: the request can be silently redirected to the sign-in
      // page (no active session yet), which returns 200 HTML and would otherwise
      // look like a success. Require a real JSON success payload before proceeding
      // so we never claim the DB record was created when it was not.
      const response = await fetch('/api/register/transport-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authUserId,
          ...formData
        }),
      })

      if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Failed to create transport company record. Please try again or contact support.')
      }

      let resultJson: { success?: boolean; error?: string } = {}
      try {
        resultJson = await response.json()
      } catch {
        throw new Error('Failed to create transport company record. Please try again or contact support.')
      }

      if (!response.ok || resultJson.success !== true) {
        throw new Error(resultJson.error || 'Failed to create transport company record')
      }

      // With Supabase, the confirmation email is sent as part of signUp above.
      // If no session was returned, email confirmation is required; otherwise the
      // user is already signed in and can go straight to the dashboard.
      if (!data.session) {
        toast.success('Registration successful! Please check your email to confirm your account, then sign in.')
        router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`)
      } else {
        toast.success('Registration successful!')
        router.replace('/dashboard')
      }

    } catch (error: unknown) {
      console.error('Registration error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Registration failed. Please try again.'
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const progressPercentage = (currentStep / totalSteps) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Logo size="xl" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Transport Company Registration</h1>
            <p className="text-gray-600 mt-2">Join our emergency response network</p>
          </div>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-4">
            <CardTitle className="text-center text-xl">
              Step {currentStep} of {totalSteps}
            </CardTitle>
            <Progress value={progressPercentage} className="w-full" />
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    Personal Information
                  </h3>
                  <p className="text-blue-700 text-sm">Enter your personal details as the company representative.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        className="pl-10"
                        placeholder="John"
                        required
                      />
                    </div>
                    {errors.firstName && <p className="text-sm text-red-600">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      placeholder="Doe"
                      required
                    />
                    {errors.lastName && <p className="text-sm text-red-600">{errors.lastName}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="pl-10"
                      placeholder="john.doe@company.com"
                      required
                    />
                  </div>
                  {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    {errors.password && <p className="text-sm text-red-600">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    {errors.confirmPassword && <p className="text-sm text-red-600">{errors.confirmPassword}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="pl-10"
                      placeholder="+1 (555) 123-4567"
                      required
                    />
                  </div>
                  {errors.phone && <p className="text-sm text-red-600">{errors.phone}</p>}
                </div>
              </div>
            )}

            {/* Step 2: Company Information */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-2 flex items-center">
                    <Building className="h-5 w-5 mr-2" />
                    Company Information
                  </h3>
                  <p className="text-green-700 text-sm">Provide details about your transport company.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => handleInputChange('companyName', e.target.value)}
                      className="pl-10"
                      placeholder="ABC Transport Services"
                      required
                    />
                  </div>
                  {errors.companyName && <p className="text-sm text-red-600">{errors.companyName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number *</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                      className="pl-10"
                      placeholder="REG123456789"
                      required
                    />
                  </div>
                  {errors.registrationNumber && <p className="text-sm text-red-600">{errors.registrationNumber}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="addressLine">Company Address *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Textarea
                      id="addressLine"
                      value={formData.addressLine}
                      onChange={(e) => handleInputChange('addressLine', e.target.value)}
                      className="pl-10"
                      placeholder="123 Business Street, Suite 100, City, State, ZIP"
                      rows={3}
                      required
                    />
                  </div>
                  {errors.addressLine && <p className="text-sm text-red-600">{errors.addressLine}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="licenseValidTill">License Valid Until</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="licenseValidTill"
                      type="date"
                      value={formData.licenseValidTill}
                      onChange={(e) => handleInputChange('licenseValidTill', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Review & Submit */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-2 flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    Review Your Information
                  </h3>
                  <p className="text-purple-700 text-sm">Please review all information before submitting.</p>
                </div>

                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border">
                    <h4 className="font-medium text-gray-900 mb-2">Personal Information</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-600">Name:</span> {formData.firstName} {formData.lastName}</div>
                      <div><span className="text-gray-600">Email:</span> {formData.email}</div>
                      <div><span className="text-gray-600">Phone:</span> {formData.phone}</div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border">
                    <h4 className="font-medium text-gray-900 mb-2">Company Information</h4>
                    <div className="space-y-1 text-sm">
                      <div><span className="text-gray-600">Company:</span> {formData.companyName}</div>
                      <div><span className="text-gray-600">Registration:</span> {formData.registrationNumber}</div>
                      <div><span className="text-gray-600">Address:</span> {formData.addressLine}</div>
                      {formData.licenseValidTill && (
                        <div><span className="text-gray-600">License Valid Until:</span> {formData.licenseValidTill}</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Next Steps</h4>
                    <ul className="text-blue-700 text-sm space-y-1">
                      <li>• Your application will be reviewed within 24-48 hours</li>
                      <li>• You&apos;ll receive an email confirmation once approved</li>
                      <li>• You can then access your transport company dashboard</li>
                      <li>• Start receiving emergency transport requests</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
              >
                Back
              </Button>

              {currentStep < totalSteps ? (
                <Button type="button" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
