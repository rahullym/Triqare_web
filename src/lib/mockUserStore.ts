// Mock user store to handle Clerk users when database sync fails
// This provides a temporary solution until database constraints are resolved

import { DatabaseUser } from '@/lib/supabase'

// In-memory store for synced users
const mockUserStore = new Map<string, DatabaseUser>()

export class MockUserStore {
  // Create a mock user from Clerk data
  static createMockUser(clerkUser: {
    id: string
    emailAddresses: Array<{ emailAddress: string }>
    firstName?: string | null
    lastName?: string | null
    imageUrl?: string
    lastSignInAt?: number | null
    createdAt?: number
    publicMetadata?: any
    privateMetadata?: any
  }): DatabaseUser {
    const email = clerkUser.emailAddresses[0]?.emailAddress || 'unknown@example.com'
    const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')
    const role = clerkUser.publicMetadata?.role || 'admin' // Default to admin for existing users

    return {
      id: clerkUser.id, // Use Clerk ID as the database ID
      clerk_user_id: clerkUser.id,
      email,
      first_name: clerkUser.firstName || null,
      last_name: clerkUser.lastName || null,
      full_name: fullName || null,
      role,
      phone: clerkUser.publicMetadata?.phone || null,
      bio: clerkUser.publicMetadata?.bio || null,
      avatar_url: clerkUser.imageUrl || null,
      is_active: true,
      created_at: clerkUser.createdAt ? new Date(clerkUser.createdAt).toISOString() : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_sign_in_at: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt).toISOString() : null,
      created_by: null,
      date_of_birth: null,
      gender: null,
      address: null,
      city: null,
      state: null,
      zip_code: null,
      country: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      emergency_contact_relationship: null,
      medical_conditions: null,
      allergies: null,
      medications: null,
      blood_type: null,
      department: role === 'admin' ? 'Emergency Management' : null,
      position: null,
      employee_id: null,
      transport_company_id: null,
      notification_preferences: {
        email: true,
        sms: false,
        push: true
      },
      language_preference: 'en',
      timezone: 'UTC'
    } as DatabaseUser
  }

  // Store a user in the mock store
  static storeUser(user: DatabaseUser): void {
    const key = user.clerk_user_id || user.auth_user_id || user.id
    mockUserStore.set(key, user)
    console.log(`Stored mock user: ${key} (${user.email})`)
  }

  // Get a user by Clerk ID
  static getUserByClerkId(clerkUserId: string): DatabaseUser | null {
    return mockUserStore.get(clerkUserId) || null
  }

  // Get all users
  static getAllUsers(): DatabaseUser[] {
    return Array.from(mockUserStore.values())
  }

  // Update a user
  static updateUser(clerkUserId: string, updates: Partial<DatabaseUser>): DatabaseUser | null {
    const existingUser = mockUserStore.get(clerkUserId)
    if (!existingUser) {
      return null
    }

    const updatedUser = {
      ...existingUser,
      ...updates,
      updated_at: new Date().toISOString()
    }

    mockUserStore.set(clerkUserId, updatedUser)
    console.log(`Updated mock user: ${clerkUserId}`)
    return updatedUser
  }

  // Check if a user exists
  static hasUser(clerkUserId: string): boolean {
    return mockUserStore.has(clerkUserId)
  }

  // Get user count
  static getUserCount(): number {
    return mockUserStore.size
  }

  // Clear all users (for testing)
  static clear(): void {
    mockUserStore.clear()
  }
}
