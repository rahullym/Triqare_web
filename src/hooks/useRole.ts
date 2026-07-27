import { useAuth } from '@/components/auth/AuthProvider'
import { UserRole } from '@/types'

/**
 * Role hook — reads the role from the signed-in user's public.users row (via
 * AuthProvider), replacing the old Clerk publicMetadata/unsafeMetadata lookup.
 * Return shape is unchanged so existing consumers/guards keep working.
 */
export function useRole(): {
  role: UserRole | null
  isAdmin: boolean
  isERT: boolean
  isTransportCompany: boolean
  isPatient: boolean
  isDriver: boolean
  loading: boolean
  updateRole: (newRole: UserRole) => Promise<void>
} {
  const { role, appUser, loading, refetchAppUser } = useAuth()

  // Update a user's role (admin only). Writes users.role server-side (service role)
  // then refreshes the local app user.
  const updateRole = async (newRole: UserRole): Promise<void> => {
    if (!appUser) throw new Error('No user found')

    const response = await fetch(`/api/users/${appUser.id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to update role: ${error}`)
    }

    await refetchAppUser()
  }

  return {
    role,
    isAdmin: role === 'admin',
    isERT: role === 'ert',
    isTransportCompany: role === 'transport_company',
    isPatient: role === 'patient',
    isDriver: role === 'driver',
    loading,
    updateRole,
  }
}
