import { supabase, DatabaseUser, CreateUserInput, UpdateUserInput } from '@/lib/supabase'
import { randomUUID } from 'crypto'
import { AutoSyncService } from './autoSyncService'
import { createClerkClient } from '@clerk/nextjs/server'

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
})

export class UserService {
  // Create a new user with automatic sync
  static async createUser(userData: CreateUserInput): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      console.log('🚀 Creating user with auto-sync:', userData.email)

      // Prepare the insert data, filtering out undefined values
      const insertData: any = {
        clerk_user_id: userData.clerk_user_id,
        email: userData.email,
        role: userData.role,
      }

      // Add optional fields only if they exist
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

      // Use AutoSyncService for automatic bidirectional sync
      return await AutoSyncService.handleUserCreation(insertData)
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

      // Apply filters
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

  // Get a single user by ID
  static async getUserById(id: string): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single()

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

  // Get a user by Clerk user ID
  static async getUserByClerkId(clerkUserId: string): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .single()

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
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single()

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

  // Update a user with automatic sync
  static async updateUser(id: string, updates: UpdateUserInput): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      console.log('🔄 Updating user with auto-sync:', id)

      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString()
      }

      // Use AutoSyncService for automatic bidirectional sync
      return await AutoSyncService.handleUserUpdate(id, updateData)
    } catch (err) {
      console.error('Unexpected error updating user:', err)
      return { data: null, error: 'Failed to update user' }
    }
  }

  // Update a user by Clerk ID
  static async updateUserByClerkId(clerkUserId: string, updates: UpdateUserInput): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('clerk_user_id', clerkUserId)
        .select()
        .single()

      if (error) {
        console.error('Error updating user by Clerk ID:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error updating user by Clerk ID:', err)
      return { data: null, error: 'Failed to update user by Clerk ID' }
    }
  }

  // Delete a user (deletes from both Clerk and Supabase)
  static async deleteUser(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      console.log('🗑️ Deleting user:', id)

      // First, get the user to find their clerk_user_id
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('id, clerk_user_id, email, full_name')
        .eq('id', id)
        .single()

      if (fetchError || !user) {
        console.error('Error fetching user for deletion:', fetchError)
        return { success: false, error: 'User not found' }
      }

      console.log(`Found user to delete: ${user.email} (Clerk ID: ${user.clerk_user_id})`)

      // Delete from Clerk first
      if (user.clerk_user_id) {
        try {
          await clerkClient.users.deleteUser(user.clerk_user_id)
          console.log(`✅ Deleted user from Clerk: ${user.clerk_user_id}`)
        } catch (clerkError: any) {
          console.error('⚠️ Error deleting from Clerk:', clerkError)
          // Continue even if Clerk deletion fails (user might not exist in Clerk)
          // This is intentional - we still want to delete from database
        }
      } else {
        console.log('⚠️ User has no Clerk ID, skipping Clerk deletion')
      }

      // Delete from database (CASCADE will handle related records)
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', id)

      if (deleteError) {
        console.error('❌ Error deleting from database:', deleteError)
        return { success: false, error: deleteError.message }
      }

      console.log(`✅ Successfully deleted user: ${user.email}`)
      return { success: true, error: null }
    } catch (err) {
      console.error('❌ Unexpected error deleting user:', err)
      return { success: false, error: 'Failed to delete user' }
    }
  }

  // Get user statistics
  static async getUserStats(): Promise<{
    data: {
      total: number
      byRole: Record<string, number>
      recentUsers: number
    } | null
    error: string | null
  }> {
    try {
      // Get total count
      const { count: total, error: totalError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      if (totalError) throw totalError

      // Get count by role
      const { data: roleData, error: roleError } = await supabase
        .from('users')
        .select('role')

      if (roleError) throw roleError

      const byRole = roleData?.reduce((acc: Record<string, number>, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1
        return acc
      }, {}) || {}

      // Get recent users (last 7 days)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { count: recentUsers, error: recentError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())

      if (recentError) throw recentError

      return {
        data: {
          total: total || 0,
          byRole,
          recentUsers: recentUsers || 0
        },
        error: null
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

  // Sync user from Clerk to database (create or update)
  static async syncUserFromClerk(clerkUser: {
    id: string
    emailAddresses: Array<{ emailAddress: string }>
    firstName?: string | null
    lastName?: string | null
    imageUrl?: string
    lastSignInAt?: number | null
    createdAt?: number
    publicMetadata?: any
    privateMetadata?: any
    unsafeMetadata?: any
  }): Promise<{ data: DatabaseUser | null; error: string | null }> {
    try {
      const email = clerkUser.emailAddresses[0]?.emailAddress
      if (!email) {
        return { data: null, error: 'No email address found for user' }
      }

      const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')
      // Get role from publicMetadata first (admin-set), then unsafeMetadata (user-set), then default
      const role = clerkUser.publicMetadata?.role || clerkUser.unsafeMetadata?.role || 'patient'

      // Prepare user data for upsert
      const userData = {
        id: randomUUID(), // Generate UUID for the id field
        clerk_user_id: clerkUser.id,
        email,
        first_name: clerkUser.firstName || null,
        last_name: clerkUser.lastName || null,
        full_name: fullName || null,
        role,
        avatar_url: clerkUser.imageUrl || null,
        last_sign_in_at: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt).toISOString() : null,
        // Get bio and phone from publicMetadata first, then unsafeMetadata
        bio: clerkUser.publicMetadata?.bio || clerkUser.unsafeMetadata?.bio || null,
        phone: clerkUser.publicMetadata?.phone || clerkUser.unsafeMetadata?.phone || null,
      }

      // Use Supabase upsert to handle both insert and update
      const { data, error } = await supabase
        .from('users')
        .upsert(userData, {
          onConflict: 'clerk_user_id', // Use clerk_user_id as the conflict resolution key
          ignoreDuplicates: false // We want to update if there's a conflict
        })
        .select()
        .single()

      if (error) {
        // If upsert fails due to email conflict, try to find existing user by email and update
        if (error.message?.includes('users_email_key')) {
          console.log(`Email conflict for ${email}, attempting to update existing user...`)

          // Find user by email
          const { data: existingUser, error: findError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single()

          if (findError || !existingUser) {
            return { data: null, error: `Email conflict and could not find existing user: ${error.message}` }
          }

          // Update the existing user with new Clerk ID and data
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
              ...userData,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingUser.id)
            .select()
            .single()

          if (updateError) {
            return { data: null, error: `Failed to update existing user: ${updateError.message}` }
          }

          return { data: updatedUser, error: null }
        }

        console.error('Error syncing user from Clerk:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (err) {
      console.error('Unexpected error syncing user from Clerk:', err)
      return { data: null, error: 'Failed to sync user from Clerk' }
    }
  }

  // Update user's last sign-in time
  static async updateLastSignIn(clerkUserId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          last_sign_in_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('clerk_user_id', clerkUserId)

      if (error) {
        console.error('Error updating last sign-in:', error)
        return { success: false, error: error.message }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Unexpected error updating last sign-in:', err)
      return { success: false, error: 'Failed to update last sign-in' }
    }
  }

  // Get users by role with enhanced filtering
  static async getUsersByRole(
    role: string,
    options?: {
      includeInactive?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<{ data: DatabaseUser[] | null; error: string | null; count?: number }> {
    try {
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('role', role)
        .order('created_at', { ascending: false })

      // Filter by active status
      if (!options?.includeInactive) {
        query = query.eq('is_active', true)
      }

      // Apply pagination
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
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
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
        .update({
          is_active: true,
          updated_at: new Date().toISOString()
        })
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

  // Find and resolve duplicate users (by email)
  static async findDuplicateUsers(): Promise<{
    data: Array<{ email: string; count: number; user_ids: string[] }> | null;
    error: string | null
  }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email')
        .order('email')

      if (error) {
        return { data: null, error: error.message }
      }

      // Group by email and find duplicates
      const emailGroups: Record<string, string[]> = {}
      data?.forEach(user => {
        if (!emailGroups[user.email]) {
          emailGroups[user.email] = []
        }
        emailGroups[user.email].push(user.id)
      })

      const duplicates = Object.entries(emailGroups)
        .filter(([email, ids]) => ids.length > 1)
        .map(([email, ids]) => ({
          email,
          count: ids.length,
          user_ids: ids
        }))

      return { data: duplicates, error: null }
    } catch (err) {
      console.error('Error finding duplicate users:', err)
      return { data: null, error: 'Failed to find duplicate users' }
    }
  }

  // Clean up duplicate users (keep the most recent one)
  static async cleanupDuplicateUsers(): Promise<{
    success: boolean;
    error: string | null;
    cleaned: number
  }> {
    try {
      const { data: duplicates, error: findError } = await this.findDuplicateUsers()

      if (findError || !duplicates) {
        return { success: false, error: findError || 'No duplicates found', cleaned: 0 }
      }

      let totalCleaned = 0

      for (const duplicate of duplicates) {
        // Get full user records for this email
        const { data: users, error: getUsersError } = await supabase
          .from('users')
          .select('*')
          .eq('email', duplicate.email)
          .order('created_at', { ascending: false }) // Most recent first

        if (getUsersError || !users || users.length <= 1) {
          continue
        }

        // Keep the first (most recent) user, delete the rest
        const usersToDelete = users.slice(1)

        for (const userToDelete of usersToDelete) {
          const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', userToDelete.id)

          if (!deleteError) {
            totalCleaned++
            console.log(`Deleted duplicate user: ${userToDelete.id} (${userToDelete.email})`)
          } else {
            console.error(`Failed to delete duplicate user ${userToDelete.id}:`, deleteError)
          }
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
