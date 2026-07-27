import { useAuth } from '@/components/auth/AuthProvider'
import { UserRole } from '@/types'

export interface CurrentUser {
  id: string
  clerkUserId: string
  email: string
  firstName?: string
  lastName?: string
  fullName?: string
  phone?: string
  role: UserRole
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export function useCurrentUser() {
  const { authUser, appUser, loading, refetchAppUser } = useAuth()

  const user: CurrentUser | null = appUser
    ? {
        id: appUser.id,
        // Kept for backwards-compat with existing consumers. Now holds the
        // Supabase auth user id (auth.uid()) instead of a Clerk user id.
        clerkUserId: appUser.authUserId ?? '',
        email: appUser.email,
        firstName: appUser.firstName ?? undefined,
        lastName: appUser.lastName ?? undefined,
        fullName: appUser.fullName ?? undefined,
        phone: appUser.phone ?? undefined,
        role: appUser.role,
        isActive: appUser.isActive,
        // AppUser (from AuthProvider) does not carry timestamps; kept on the
        // interface so consumers don't break.
        createdAt: '',
        updatedAt: '',
      }
    : null

  const error =
    !loading && authUser && !appUser
      ? 'User not found in database. Please complete your registration.'
      : null

  return {
    user,
    isLoading: loading,
    error,
    refetch: refetchAppUser,
  }
}

// Helper hook to check if user has specific role
export function useUserRole(requiredRole: UserRole) {
  const { user, isLoading, error } = useCurrentUser()

  return {
    hasRole: user?.role === requiredRole,
    user,
    isLoading,
    error
  }
}

// Helper hook to check if user has any of the specified roles
export function useUserRoles(requiredRoles: UserRole[]) {
  const { user, isLoading, error } = useCurrentUser()

  return {
    hasRole: user ? requiredRoles.includes(user.role) : false,
    user,
    isLoading,
    error
  }
}
