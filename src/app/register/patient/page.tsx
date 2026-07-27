'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Logo } from '@/components/ui/logo'
import { User, Mail, Phone, Calendar, MapPin, Heart, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PatientFormData {
  // Basic Info
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  phone: string
  dateOfBirth: string
  gender: string

  // Address
  address: string
  city: string
  state: string
  zipCode: string
  country: string

  // Emergency Contact
  emergencyContactName: string
  emergencyContactPhone: string
  emergencyContactRelationship: string

  // Medical Info
  bloodType: string
  medicalConditions: string
  allergies: string
  medications: string
  insuranceProvider: string
  insuranceNumber: string
}

export default function PatientRegistrationPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState<PatientFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    // Main patients are India-only (business rule). The field is not user-editable;
    // the server also hard-locks this to India (see /api/register/patient).
    country: 'India',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    bloodType: '',
    medicalConditions: '',
    allergies: '',
    medications: '',
    insuranceProvider: '',
    insuranceNumber: ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleInputChange = (field: keyof PatientFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required'
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required'
      if (!formData.email.trim()) newErrors.email = 'Email is required'
      if (!formData.email.includes('@')) newErrors.email = 'Valid email is required'
      if (!formData.password) newErrors.password = 'Password is required'
      if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters'
      if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
      if (!formData.phone.trim()) newErrors.phone = 'Phone number is required'
      if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required'
      if (!formData.gender) newErrors.gender = 'Gender is required'
    }

    if (step === 2) {
      if (!formData.address.trim()) newErrors.address = 'Address is required'
      if (!formData.city.trim()) newErrors.city = 'City is required'
      if (!formData.state.trim()) newErrors.state = 'State is required'
      if (!formData.zipCode.trim()) newErrors.zipCode = 'ZIP code is required'
      if (!formData.emergencyContactName.trim()) newErrors.emergencyContactName = 'Emergency contact name is required'
      if (!formData.emergencyContactPhone.trim()) newErrors.emergencyContactPhone = 'Emergency contact phone is required'
      if (!formData.emergencyContactRelationship.trim()) newErrors.emergencyContactRelationship = 'Relationship is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    setCurrentStep(prev => prev - 1)
  }

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    setIsLoading(true)

    try {
      // Create the Supabase auth user. A Postgres trigger (handle_new_auth_user)
      // creates the public.users row automatically (default role 'patient') and
      // links any pre-existing row by email — so the client must NOT set a
      // privileged role here; the `data` below is display-only metadata.
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

      // Create the domain (patients) record via API.
      // Defense-in-depth: the request can be silently redirected to the sign-in
      // page (no active session yet), which returns 200 HTML and would otherwise
      // look like a success. Require a real JSON success payload before proceeding
      // so we never claim the DB record was created when it was not.
      const response = await fetch('/api/register/patient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authUserId,
          ...formData
        }),
      })

      if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Failed to create patient record. Please try again or contact support.')
      }

      let result_json: { success?: boolean; error?: string } = {}
      try {
        result_json = await response.json()
      } catch {
        throw new Error('Failed to create patient record. Please try again or contact support.')
      }

      if (!response.ok || result_json.success !== true) {
        throw new Error(result_json.error || 'Failed to create patient record')
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

  const totalSteps = 3

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg border-2 border-blue-100">
            <Logo size="md" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Patient Registration</h1>
          <p className="text-gray-600">Create your patient account to access emergency services</p>
        </div>

        {/* Progress Indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step <= currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {step}
                </div>
                {step < totalSteps && (
                  <div className={`w-12 h-1 mx-2 ${
                    step < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card className="bg-white shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-900">
              {currentStep === 1 && 'Personal Information'}
              {currentStep === 2 && 'Address & Emergency Contact'}
              {currentStep === 3 && 'Medical Information'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Personal Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
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
                      placeholder="john.doe@example.com"
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                    {errors.dateOfBirth && <p className="text-sm text-red-600">{errors.dateOfBirth}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Gender *</Label>
                  <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.gender && <p className="text-sm text-red-600">{errors.gender}</p>}
                </div>
              </div>
            )}

            {/* Step 2: Address & Emergency Contact */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Address *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      className="pl-10"
                      placeholder="123 Main Street, Apt 4B"
                      required
                    />
                  </div>
                  {errors.address && <p className="text-sm text-red-600">{errors.address}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="New York"
                      required
                    />
                    {errors.city && <p className="text-sm text-red-600">{errors.city}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      placeholder="NY"
                      required
                    />
                    {errors.state && <p className="text-sm text-red-600">{errors.state}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">ZIP Code *</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      placeholder="10001"
                      required
                    />
                    {errors.zipCode && <p className="text-sm text-red-600">{errors.zipCode}</p>}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 flex items-center">
                    <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
                    Emergency Contact
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactName">Contact Name *</Label>
                      <Input
                        id="emergencyContactName"
                        value={formData.emergencyContactName}
                        onChange={(e) => handleInputChange('emergencyContactName', e.target.value)}
                        placeholder="Jane Doe"
                        required
                      />
                      {errors.emergencyContactName && <p className="text-sm text-red-600">{errors.emergencyContactName}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactPhone">Contact Phone *</Label>
                      <Input
                        id="emergencyContactPhone"
                        type="tel"
                        value={formData.emergencyContactPhone}
                        onChange={(e) => handleInputChange('emergencyContactPhone', e.target.value)}
                        placeholder="+1 (555) 987-6543"
                        required
                      />
                      {errors.emergencyContactPhone && <p className="text-sm text-red-600">{errors.emergencyContactPhone}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactRelationship">Relationship *</Label>
                    <Select value={formData.emergencyContactRelationship} onValueChange={(value) => handleInputChange('emergencyContactRelationship', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select relationship" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spouse">Spouse</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="sibling">Sibling</SelectItem>
                        <SelectItem value="friend">Friend</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.emergencyContactRelationship && <p className="text-sm text-red-600">{errors.emergencyContactRelationship}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Medical Information */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
                    <Heart className="h-5 w-5 mr-2" />
                    Medical Information
                  </h3>
                  <p className="text-blue-700 text-sm">This information helps emergency responders provide better care.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bloodType">Blood Type</Label>
                    <Select value={formData.bloodType} onValueChange={(value) => handleInputChange('bloodType', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select blood type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insuranceProvider">Insurance Provider</Label>
                    <Input
                      id="insuranceProvider"
                      value={formData.insuranceProvider}
                      onChange={(e) => handleInputChange('insuranceProvider', e.target.value)}
                      placeholder="Blue Cross Blue Shield"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="insuranceNumber">Insurance Number</Label>
                  <Input
                    id="insuranceNumber"
                    value={formData.insuranceNumber}
                    onChange={(e) => handleInputChange('insuranceNumber', e.target.value)}
                    placeholder="ABC123456789"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medicalConditions">Medical Conditions</Label>
                  <Textarea
                    id="medicalConditions"
                    value={formData.medicalConditions}
                    onChange={(e) => handleInputChange('medicalConditions', e.target.value)}
                    placeholder="Diabetes, Hypertension, etc."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allergies">Allergies</Label>
                  <Textarea
                    id="allergies"
                    value={formData.allergies}
                    onChange={(e) => handleInputChange('allergies', e.target.value)}
                    placeholder="Penicillin, Peanuts, etc."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medications">Current Medications</Label>
                  <Textarea
                    id="medications"
                    value={formData.medications}
                    onChange={(e) => handleInputChange('medications', e.target.value)}
                    placeholder="Metformin 500mg, Lisinopril 10mg, etc."
                    rows={3}
                  />
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
