import { DatabaseUser, CreateUserInput, UpdateUserInput } from '@/lib/supabase'
import { createServerClient } from '@/lib/supabase/server'

/**
 * SERVER-ONLY user service. Uses the service-role client (bypasses RLS) for
 * privileged user administration. Identity is keyed on the Supabase auth user id
 * (public.users.auth_user_id) since the Clerk migration; `getUserByClerkId` is
 * retained only for legacy rows that still carry a clerk_user_id.
 */
const supabase = createServerClient()

export class UserService {
  // Create a new user row directly (no Clerk, no auto-sync). For login-capable
  // accounts the Supabase auth user is created via supabase.auth.admin.createUser
  // elsewhere and the handle_new_auth_user() trigger provisions/links this row;
  // this method is for pre-provisioning rows (CSV imports, admin-created records)
  // that will be linked by email on first login.
  static async createUser(userData: CreateUserInput): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const insertData: any = {
        email: userData.email,
        role: userData.role,
      }
      if (userData.clerk_user_id) insertData.clerk_user_id = userData.clerk_user_id
      if (userData.first_name) insertData.first_name = userData.first_name
      if (userData.last_name) insertData.last_name = userData.last_name
      if (userData.full_name) insertData.full_name = userData.full_name
      if (userData.phone) insertData.phone = userData.phone
      if (userData.bio) insertData.bio = userData.bio
      if (userData.avatar_url) insertData.avatar_url = userData.avatar_url
      if (userData.created_by) insertData.created_by = userData.created_by
      if (userData.date_of_birth) insertData.date_of_birth = userData.date_of_birth
      if (userData.gender) insertData.gender = userData.gender
      if (userData.address) insertData.address = userData.address
      if (userData.city) insertData.city = userData.city
      if (userData.state) insertData.state = userData.state
      if (userData.zip_code) insertData.zip_code = userData.zip_code
      if (userData.country) insertData.country = userData.country
      if (userData.emergency_contact_name) insertData.emergency_contact_name = userData.emergency_contact_name
      if (userData.emergency_contact_phone) insertData.emergency_contact_phone = userData.emergency_contact_phone
      if (userData.emergency_contact_relationship) insertData.emergency_contact_relationship = userData.emergency_contact_relationship
      if (userData.medical_conditions) insertData.medical_conditions = userData.medical_conditions
      if (userData.allergies) insertData.allergies = userData.allergies
      if (userData.medications) insertData.medications = userData.medications
      if (userData.blood_type) insertData.blood_type = userData.blood_type
      if (userData.department) insertData.department = userData.department
      if (userData.position) insertData.position = userData.position
      if (userData.employee_id) insertData.employee_id = userData.employee_id
      if (userData.transport_company_id) insertData.transport_company_id = userData.transport_company_id
      if (userData.notification_preferences) insertData.notification_preferences = userData.notification_preferences
      if (userData.language_preference) insertData.language_preference = userData.language_preference
      if (userData.timezone) insertData.timezone = userData.timezone

      const { data, error } = await supabase.from('users').insert(insertData).select().single()
      if (error) {
        console.error('Error creating user:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error creating user:', err)
      return { data: null, error: 'Failed to create user' }
    }
  }

  // Get all users with optional filtering
  static async getUsers(filters?: {
    role?: string
    transport_company_id?: string
    search?: string
    limit?: number
    offset?: number
  }): Promise<{ data: DatabaseUser[] | null; error: string | null; count?: number }> {
    try {
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (filters?.role) {
        query = query.eq('role', filters.role)
      }
      if (filters?.transport_company_id) {
        query = query.eq('transport_company_id', filters.transport_company_id)
      }
      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
      }
      if (filters?.limit) {
        query = query.limit(filters.limit)
      }
      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
      }

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching users:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null, count: count || 0 }
    } catch (err) {
      console.error('Unexpected error fetching users:', err)
      return { data: null, error: 'Failed to fetch users' }
    }
  }

  // Get a single user by internal id
  static async getUserById(id: string): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('id', id).single()
      if (error) {
        console.error('Error fetching user:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error fetching user:', err)
      return { data: null, error: 'Failed to fetch user' }
    }
  }

  // Get a user by Supabase auth user id (the current identity key).
  static async getUserByAuthId(authUserId: string): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle()
      if (error) {
        console.error('Error fetching user by auth id:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error fetching user by auth id:', err)
      return { data: null, error: 'Failed to fetch user' }
    }
  }

  // Legacy: get a user by Clerk user id (only matches rows not yet migrated).
  static async getUserByClerkId(clerkUserId: string): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .maybeSingle()
      if (error) {
        console.error('Error fetching user by Clerk ID:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error fetching user by Clerk ID:', err)
      return { data: null, error: 'Failed to fetch user' }
    }
  }

  // Get a user by email
  static async getUserByEmail(email: string): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle()
      if (error) {
        console.error('Error fetching user by email:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error fetching user by email:', err)
      return { data: null, error: 'Failed to fetch user' }
    }
  }

  // Update a user by internal id
  static async updateUser(id: string, updates: UpdateUserInput): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const updateData: any = { ...updates, updated_at: new Date().toISOString() }

      // An email change has to reach the LOGIN as well as the profile row.
      // public.users.email is only what the dashboard displays; the credential
      // lives in auth.users. Updating one without the other left an account whose
      // shown address no longer signed in — and the login row still holding the
      // old address, so re-adding that address failed as "already registered".
      // Done first: if GoTrue rejects the address (already taken), the profile row
      // is left untouched rather than pointing at an email nobody can log in with.
      if (typeof updateData.email === 'string' && updateData.email.trim()) {
        const nextEmail = updateData.email.trim().toLowerCase()
        updateData.email = nextEmail

        const { data: current } = await supabase
          .from('users')
          .select('email, auth_user_id')
          .eq('id', id)
          .maybeSingle()

        if (current && current.email?.toLowerCase() !== nextEmail && current.auth_user_id) {
          const { error: authError } = await supabase.auth.admin.updateUserById(current.auth_user_id, {
            email: nextEmail,
            email_confirm: true, // admin-set address; no re-confirmation round trip
          })
          if (authError) {
            return { data: null, error: `Could not change the login email: ${authError.message}` }
          }
        }
      }

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()
      if (error) {
        console.error('Error updating user:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error updating user:', err)
      return { data: null, error: 'Failed to update user' }
    }
  }

  // Update a user by Supabase auth user id
  static async updateUserByAuthId(authUserId: string, updates: UpdateUserInput): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const updateData: any = { ...updates, updated_at: new Date().toISOString() }
      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('auth_user_id', authUserId)
        .select()
        .single()
      if (error) {
        console.error('Error updating user by auth ID:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error updating user by auth ID:', err)
      return { data: null, error: 'Failed to update user by auth ID' }
    }
  }

  // Delete a user: remove the Supabase auth user (if linked) then the app row.
  static async deleteUser(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('id, auth_user_id, email, full_name')
        .eq('id', id)
        .single()

      if (fetchError || !user) {
        console.error('Error fetching user for deletion:', fetchError)
        return { success: false, error: 'User not found' }
      }

      // Delete the Supabase auth user first (if this row is linked to one). A
      // missing auth user (already gone) is fine; any other failure aborts so we
      // don't orphan a login whose app row is deleted.
      if (user.auth_user_id) {
        const { error: authError } = await supabase.auth.admin.deleteUser(user.auth_user_id)
        if (authError && authError.status !== 404 && !/not.?found/i.test(authError.message || '')) {
          console.error('❌ Aborting deletion — auth user delete failed:', authError)
          return {
            success: false,
            error: `Failed to delete auth user (${authError.status ?? 'unknown'}). Aborted to avoid orphaning the account. Please retry.`,
          }
        }
      }

      const { error: deleteError } = await supabase.from('users').delete().eq('id', id)
      if (deleteError) {
        console.error('❌ Error deleting from database:', deleteError)
        return { success: false, error: deleteError.message }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('❌ Unexpected error deleting user:', err)
      return { success: false, error: 'Failed to delete user' }
    }
  }

  // Get user statistics
  static async getUserStats(): Promise<{
    data: { total: number; byRole: Record<string, number>; recentUsers: number } | null
    error: string | null
  }> {
    try {
      const { count: total, error: totalError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
      if (totalError) throw totalError

      const { data: roleData, error: roleError } = await supabase.from('users').select('role')
      if (roleError) throw roleError

      const byRole = roleData?.reduce((acc: Record<string, number>, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1
        return acc
      }, {}) || {}

      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { count: recentUsers, error: recentError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())
      if (recentError) throw recentError

      return {
        data: { total: total || 0, byRole, recentUsers: recentUsers || 0 },
        error: null,
      }
    } catch (err) {
      console.error('Unexpected error fetching user stats:', err)
      return { data: null, error: 'Failed to fetch user statistics' }
    }
  }

  // Search users by name or email
  static async searchUsers(query: string, limit = 10): Promise<{ data: DatabaseUser[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(limit)
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Error searching users:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error searching users:', err)
      return { data: null, error: 'Failed to search users' }
    }
  }

  // Get users by role with enhanced filtering
  static async getUsersByRole(
    role: string,
    options?: { includeInactive?: boolean; limit?: number; offset?: number },
  ): Promise<{ data: DatabaseUser[] | null; error: string | null; count?: number }> {
    try {
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('role', role)
        .order('created_at', { ascending: false })

      if (!options?.includeInactive) {
        query = query.eq('is_active', true)
      }
      if (options?.limit) {
        query = query.limit(options.limit)
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
      }

      const { data, error, count } = await query
      if (error) {
        console.error('Error fetching users by role:', error)
        return { data: null, error: error.message }
      }
      return { data, error: null, count: count || 0 }
    } catch (err) {
      console.error('Unexpected error fetching users by role:', err)
      return { data: null, error: 'Failed to fetch users by role' }
    }
  }

  // Deactivate user (soft delete)
  static async deactivateUser(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        console.error('Error deactivating user:', error)
        return { success: false, error: error.message }
      }
      return { success: true, error: null }
    } catch (err) {
      console.error('Unexpected error deactivating user:', err)
      return { success: false, error: 'Failed to deactivate user' }
    }
  }

  // Reactivate user
  static async reactivateUser(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        console.error('Error reactivating user:', error)
        return { success: false, error: error.message }
      }
      return { success: true, error: null }
    } catch (err) {
      console.error('Unexpected error reactivating user:', err)
      return { success: false, error: 'Failed to reactivate user' }
    }
  }

  // Find duplicate users (by email)
  static async findDuplicateUsers(): Promise<{
    data: Array<{ email: string; count: number; user_ids: string[] }> | null
    error: string | null
  }> {
    try {
      const { data, error } = await supabase.from('users').select('id, email').order('email')
      if (error) {
        return { data: null, error: error.message }
      }
      const emailGroups: Record<string, string[]> = {}
      data?.forEach((user) => {
        if (!emailGroups[user.email]) emailGroups[user.email] = []
        emailGroups[user.email].push(user.id)
      })
      const duplicates = Object.entries(emailGroups)
        .filter(([, ids]) => ids.length > 1)
        .map(([email, ids]) => ({ email, count: ids.length, user_ids: ids }))
      return { data: duplicates, error: null }
    } catch (err) {
      console.error('Error finding duplicate users:', err)
      return { data: null, error: 'Failed to find duplicate users' }
    }
  }

  // Clean up duplicate users (keep the most recent one)
  static async cleanupDuplicateUsers(): Promise<{ success: boolean; error: string | null; cleaned: number }> {
    try {
      const { data: duplicates, error: findError } = await this.findDuplicateUsers()
      if (findError || !duplicates) {
        return { success: false, error: findError || 'No duplicates found', cleaned: 0 }
      }
      let totalCleaned = 0
      for (const duplicate of duplicates) {
        const { data: users, error: getUsersError } = await supabase
          .from('users')
          .select('*')
          .eq('email', duplicate.email)
          .order('created_at', { ascending: false })
        if (getUsersError || !users || users.length <= 1) continue
        const usersToDelete = users.slice(1)
        for (const userToDelete of usersToDelete) {
          const { error: deleteError } = await supabase.from('users').delete().eq('id', userToDelete.id)
          if (!deleteError) totalCleaned++
          else console.error(`Failed to delete duplicate user ${userToDelete.id}:`, deleteError)
        }
      }
      return { success: true, error: null, cleaned: totalCleaned }
    } catch (err) {
      console.error('Error cleaning up duplicate users:', err)
      return { success: false, error: 'Failed to cleanup duplicate users', cleaned: 0 }
    }
  }
}

// Export the class as userService
export const userService = UserService
