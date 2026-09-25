'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import {
  Edit,
  Save,
  X,
  ArrowLeft,
  User,
  Phone,
  Heart,
  Calendar,
  Users,
  Trash2,
  AlertTriangle,
  MapPin
} from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { usePatient, useUpdatePatient, useDeletePatient } from '@/hooks/usePatients'
import { useHospitals } from '@/hooks/useHospitals'
import { useCountries, useStates, useCities, usePincodes } from '@/hooks/useLocations'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmergencyContacts } from '@/components/EmergencyContacts'
import LocationPicker from '@/components/maps/LocationPicker'



export default function EditPatientPage() {
  const params = useParams()
  const router = useRouter()
  const patientId = params.id as string

  // Database hooks
  const { patient, loading: patientLoading, error: patientError, refetch } = usePatient(patientId)
  const { hospitals, loading: hospitalsLoading } = useHospitals()
  const { updatePatient, loading: updateLoading } = useUpdatePatient()
  const { deletePatient, loading: deleteLoading } = useDeletePatient()

  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [formData, setFormData] = useState({
    user_id: '',
    full_name: '',
    email: '',
    dob: '',
    gender: '' as 'Male' | 'Female' | 'Other' | '',
    blood_group: '' as 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-' | '',
    allergies: '',
    abha_id: '',
    insurance_provider: '',
    insurance_policy_number: '',
    insurance_valid_till: '',
    primary_hospital_id: '',
    secondary_hospital_id: '',
    latitude: '',
    longitude: '',
    country_id: '',
    state_id: '',
    city_id: '',
    pincode_id: '',
    address_line: ''
  })

  // Hospital picker options. The patient's own selection is appended when the
  // fetched list does not contain it (list capped/filtered, or the hospital was
  // added from the mobile app after this page loaded), otherwise the Combobox
  // silently renders the placeholder and the selection looks empty.
  const hospitalOptions = (() => {
    const opts: ComboboxOption[] = (hospitals ?? []).map((hospital) => ({
      value: hospital.id,
      label: hospital.name
    }))
    const known = new Set(opts.map((o) => o.value))
    const extras: Array<[string | undefined, string | undefined]> = [
      [patient?.primary_hospital_id, patient?.primary_hospital_name],
      [patient?.secondary_hospital_id, patient?.secondary_hospital_name]
    ]
    for (const [id, name] of extras) {
      if (id && !known.has(id)) {
        opts.push({ value: id, label: name || `Hospital ${id.slice(0, 8)}… (not in list)` })
        known.add(id)
      }
    }
    return opts
  })()

  // Location hooks
  const { countries } = useCountries()
  const { states } = useStates(formData.country_id || undefined)
  const { cities } = useCities(formData.state_id || undefined)
  const { pincodes } = usePincodes(formData.city_id || undefined)

  // Populate form data when patient data is loaded
  useEffect(() => {
    if (patient) {
      setFormData({
        user_id: patient.user_id || '',
        full_name: patient.full_name || '',
        email: patient.email || '',
        dob: patient.dob || '',
        gender: patient.gender || '',
        blood_group: patient.blood_group || '',
        allergies: patient.allergies || '',
        abha_id: patient.abha_id || '',
        insurance_provider: patient.insurance_provider || '',
        insurance_policy_number: patient.insurance_policy_number || '',
        insurance_valid_till: patient.insurance_valid_till || '',
        primary_hospital_id: patient.primary_hospital_id || '',
        secondary_hospital_id: patient.secondary_hospital_id || '',
        latitude: patient.latitude?.toString() || '',
        longitude: patient.longitude?.toString() || '',
        country_id: patient.country_id || '',
        state_id: patient.state_id || '',
        city_id: patient.city_id || '',
        pincode_id: patient.pincode_id || '',
        address_line: patient.address_line || ''
      })
    }
  }, [patient])

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Convert form data to proper types and exclude user fields
      const { full_name, email, ...patientFields } = formData
      const updateData = {
        ...patientFields,
        gender: patientFields.gender || undefined,
        blood_group: patientFields.blood_group || undefined,
        latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
        dob: formData.dob || undefined,
        insurance_valid_till: formData.insurance_valid_till || undefined,
        primary_hospital_id: formData.primary_hospital_id === 'none' ? undefined : formData.primary_hospital_id || undefined,
        secondary_hospital_id: formData.secondary_hospital_id === 'none' ? undefined : formData.secondary_hospital_id || undefined,
      }

      const result = await updatePatient(patientId, updateData)

      if (result) {
        toast.success('Patient updated successfully')
        setIsEditing(false)
        refetch() // Refresh patient data
      } else {
        toast.error('Failed to update patient')
      }
    } catch (error) {
      console.error('Error updating patient:', error)
      toast.error('Failed to update patient')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsSubmitting(true)

    try {
      const success = await deletePatient(patientId)

      if (success) {
        toast.success('Patient deleted successfully')
        router.push('/admin/patients')
      } else {
        toast.error('Failed to delete patient')
      }
    } catch (error) {
      console.error('Error deleting patient:', error)
      toast.error('Failed to delete patient')
    } finally {
      setIsSubmitting(false)
      setShowDeleteConfirm(false)
    }
  }

  // Loading state
  if (patientLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  // Error state
  if (patientError || !patient) {
    return (
      <div className="p-6 space-y-6">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Patient Not Found</h2>
          <p className="text-gray-600 mb-4">
            {patientError || 'The patient you are looking for does not exist.'}
          </p>
          <Link href="/admin/patients">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Patients
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/admin/patients">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Patients
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                👤 Patient Details
              </h1>
              <p className="text-gray-600">
                Patient ID: {patientId} • {patient?.full_name || 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className="bg-green-100 text-green-800">
              ✓ Patient Record
            </Badge>
            <Badge className="bg-blue-100 text-blue-800">
              <Edit className="h-3 w-3 mr-1" />
              Admin Access
            </Badge>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Patient
              </Button>
            ) : (
              <div className="flex items-center space-x-2">
                <Button onClick={() => setIsEditing(false)} variant="outline">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
          <Button 
            variant="destructive" 
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSubmitting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Patient
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => handleInputChange('full_name', e.target.value)}
                    disabled={true} // Name comes from users table
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Name is managed in user profile</p>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    disabled={true} // Email comes from users table
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email is managed in user profile</p>
                </div>
                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={formData.dob}
                    onChange={(e) => handleInputChange('dob', e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Combobox
                    options={[
                      { value: "Male", label: "Male" },
                      { value: "Female", label: "Female" },
                      { value: "Other", label: "Other" }
                    ]}
                    value={formData.gender}
                    onValueChange={(value) => handleInputChange('gender', value)}
                    disabled={!isEditing}
                    placeholder="Select gender"
                    searchPlaceholder="Search gender..."
                  />
                </div>
                <div>
                  <Label htmlFor="blood_group">Blood Group</Label>
                  <Combobox
                    options={[
                      { value: "A+", label: "A+" },
                      { value: "A-", label: "A-" },
                      { value: "B+", label: "B+" },
                      { value: "B-", label: "B-" },
                      { value: "AB+", label: "AB+" },
                      { value: "AB-", label: "AB-" },
                      { value: "O+", label: "O+" },
                      { value: "O-", label: "O-" }
                    ]}
                    value={formData.blood_group}
                    onValueChange={(value) => handleInputChange('blood_group', value)}
                    disabled={!isEditing}
                    placeholder="Select blood group"
                    searchPlaceholder="Search blood group..."
                  />
                </div>
                <div>
                  <Label htmlFor="abha_id">ABHA ID</Label>
                  <Input
                    id="abha_id"
                    value={formData.abha_id}
                    onChange={(e) => handleInputChange('abha_id', e.target.value)}
                    disabled={!isEditing}
                    placeholder="12-3456-7890-1234"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="country_id">Country</Label>
                  <Combobox
                    options={countries?.map((country): ComboboxOption => ({
                      value: country.id,
                      label: country.name
                    })) || []}
                    value={formData.country_id}
                    onValueChange={(value) => {
                      handleInputChange('country_id', value)
                      handleInputChange('state_id', '')
                      handleInputChange('city_id', '')
                      handleInputChange('pincode_id', '')
                    }}
                    disabled={!isEditing}
                    placeholder="Select country"
                    searchPlaceholder="Search countries..."
                    emptyText="No countries found."
                  />
                </div>
                <div>
                  <Label htmlFor="state_id">State</Label>
                  <Combobox
                    options={states?.map((state): ComboboxOption => ({
                      value: state.id,
                      label: state.name
                    })) || []}
                    value={formData.state_id}
                    onValueChange={(value) => {
                      handleInputChange('state_id', value)
                      handleInputChange('city_id', '')
                      handleInputChange('pincode_id', '')
                    }}
                    disabled={!isEditing || !formData.country_id}
                    placeholder="Select state"
                    searchPlaceholder="Search states..."
                    emptyText="No states found."
                  />
                </div>
                <div>
                  <Label htmlFor="city_id">City</Label>
                  <Combobox
                    options={cities?.map((city): ComboboxOption => ({
                      value: city.id,
                      label: city.name
                    })) || []}
                    value={formData.city_id}
                    onValueChange={(value) => {
                      handleInputChange('city_id', value)
                      handleInputChange('pincode_id', '')
                    }}
                    disabled={!isEditing || !formData.state_id}
                    placeholder="Select city"
                    searchPlaceholder="Search cities..."
                    emptyText="No cities found."
                  />
                </div>
                <div>
                  <Label htmlFor="pincode_id">Pincode</Label>
                  <Combobox
                    options={pincodes?.map((pincode): ComboboxOption => ({
                      value: pincode.id,
                      label: pincode.code
                    })) || []}
                    value={formData.pincode_id}
                    onValueChange={(value) => handleInputChange('pincode_id', value)}
                    disabled={!isEditing || !formData.city_id}
                    placeholder="Select pincode"
                    searchPlaceholder="Search pincodes..."
                    emptyText="No pincodes found."
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="address_line">Address Line</Label>
                <Textarea
                  id="address_line"
                  value={formData.address_line}
                  onChange={(e) => handleInputChange('address_line', e.target.value)}
                  disabled={!isEditing}
                  placeholder="Street address, building name, etc."
                />
              </div>
              <LocationPicker
                latitude={formData.latitude}
                longitude={formData.longitude}
                onLocationChange={(lat, lng) => {
                  handleInputChange('latitude', lat)
                  handleInputChange('longitude', lng)
                }}
                disabled={!isEditing}
                label="Coordinates (click map icon to select)"
              />
            </CardContent>
          </Card>

          {/* Emergency Contacts */}
          <EmergencyContacts
            patientId={patientId}
            isEditable={isEditing}
          />

          {/* Medical Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Medical Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="allergies">Allergies</Label>
                <Textarea
                  id="allergies"
                  value={formData.allergies}
                  onChange={(e) => handleInputChange('allergies', e.target.value)}
                  disabled={!isEditing}
                  placeholder="List any known allergies (medications, food, environmental, etc.)"
                />
              </div>
            </CardContent>
          </Card>

          {/* Insurance Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Insurance Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="insurance_provider">Insurance Provider</Label>
                  <Input
                    id="insurance_provider"
                    value={formData.insurance_provider}
                    onChange={(e) => handleInputChange('insurance_provider', e.target.value)}
                    disabled={!isEditing}
                    placeholder="e.g., Blue Cross Blue Shield"
                  />
                </div>
                <div>
                  <Label htmlFor="insurance_policy_number">Policy Number</Label>
                  <Input
                    id="insurance_policy_number"
                    value={formData.insurance_policy_number}
                    onChange={(e) => handleInputChange('insurance_policy_number', e.target.value)}
                    disabled={!isEditing}
                    placeholder="e.g., BC123456789"
                  />
                </div>
                <div>
                  <Label htmlFor="insurance_valid_till">Valid Till</Label>
                  <Input
                    id="insurance_valid_till"
                    type="date"
                    value={formData.insurance_valid_till}
                    onChange={(e) => handleInputChange('insurance_valid_till', e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hospital Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Hospital Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="primary_hospital_id">Primary Hospital</Label>
                  <Combobox
                    options={[
                      { value: "none", label: "No Primary Hospital" },
                      ...hospitalOptions
                    ]}
                    value={formData.primary_hospital_id}
                    onValueChange={(value) => handleInputChange('primary_hospital_id', value)}
                    disabled={!isEditing || hospitalsLoading}
                    placeholder="Select Primary Hospital"
                    searchPlaceholder="Search hospitals..."
                    emptyText="No hospitals found."
                  />
                </div>
                <div>
                  <Label htmlFor="secondary_hospital_id">Secondary Hospital</Label>
                  <Combobox
                    options={[
                      { value: "none", label: "No Secondary Hospital" },
                      ...hospitalOptions
                    ]}
                    value={formData.secondary_hospital_id}
                    onValueChange={(value) => handleInputChange('secondary_hospital_id', value)}
                    disabled={!isEditing || hospitalsLoading}
                    placeholder="Select Secondary Hospital"
                    searchPlaceholder="Search hospitals..."
                    emptyText="No hospitals found."
                  />
                </div>
              </div>
            </CardContent>
          </Card>



          {/* Save Button - Only show when editing */}
          {isEditing && (
            <div className="flex items-center justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </form>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Confirm Deletion
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this patient record? This action cannot be undone and will permanently remove all patient data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Patient
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}
