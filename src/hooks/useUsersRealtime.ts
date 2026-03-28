import { useState, useEffect, useCallback } from 'react'
import { supabase, DatabaseUser } from '@/lib/supabase'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface UseUsersRealtimeOptions {
  enabled?: boolean
  filters?: {
    role?: string
    search?: string
    limit?: number
    offset?: number
  }
  onInsert?: (user: any) => void
  onUpdate?: (user: any) => void
  onDelete?: (userId: string) => void
}

/**
 * Hook for fetching users with real-time updates via Supabase Realtime
 * 
 * Features:
 * - Initial data fetch with pagination and filtering
 * - Real-time INSERT subscriptions (new users appear instantly)
 * - Real-time UPDATE subscriptions (status changes, role changes sync across all clients)
 * - Real-time DELETE subscriptions (deletions sync instantly)
 * - Connection status tracking
 * - Automatic cleanup on unmount
 * - Retry logic for connection failures
 * 
 * @param options - Realtime options (enabled, filters, callbacks)
 */
export function useUsersRealtime(
  options: UseUsersRealtimeOptions = {}
) {
  const { enabled = true, filters, onInsert, onUpdate, onDelete } = options

  const [users, setUsers] = useState<DatabaseUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [count, setCount] = useState(0)

  // Fetch users from database
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Build query
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters?.role) {
        query = query.eq('role', filters.role)
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

      const { data, error: fetchError, count: totalCount } = await query

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      setUsers(data || [])
      setCount(totalCount || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Fetch users when filters change
  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Setup realtime subscription (separate from data fetching)
  useEffect(() => {
    if (!enabled) {
      return
    }

    let channel: RealtimeChannel
    let retryTimeout: NodeJS.Timeout

    // Subscribe to users table changes
    const setupChannel = () => {
      channel = supabase
        .channel('users-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'users'
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            console.log('👤 NEW USER - Realtime INSERT:', payload.new)
            // Refetch to get complete data and update count
            fetchUsers()
            if (onInsert) onInsert(payload.new)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users'
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            console.log('🔄 USER UPDATE - Realtime UPDATE:', payload.new)
            // Update the specific user in the list
            setUsers(prev => prev.map(user =>
              user.id === payload.new.id
                ? { ...user, ...payload.new }
                : user
            ))
            if (onUpdate) onUpdate(payload.new)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'users'
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            console.log('❌ USER DELETED - Realtime DELETE:', payload.old)
            const deletedId = (payload.old as any)?.id
            if (deletedId) {
              setUsers(prev => prev.filter(user => user.id !== deletedId))
              setCount(prev => Math.max(0, prev - 1))
              if (onDelete) onDelete(deletedId)
            }
          }
        )
        .subscribe((status, err) => {
          console.log('📡 Users Realtime connection status:', status, err)

          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
            console.log('✅ Successfully connected to Users Realtime')
          } else if (status === 'CHANNEL_ERROR') {
            setIsConnected(false)
            console.error('❌ Realtime channel error:', err)
            // Retry connection after 5 seconds
            retryTimeout = setTimeout(() => {
              console.log('🔄 Retrying Users Realtime connection...')
              supabase.removeChannel(channel)
              setupChannel()
            }, 5000)
          } else if (status === 'TIMED_OUT') {
            setIsConnected(false)
            console.error('⏱️ Realtime connection timed out')
            // Retry connection after 5 seconds
            retryTimeout = setTimeout(() => {
              console.log('🔄 Retrying Users Realtime connection...')
              supabase.removeChannel(channel)
              setupChannel()
            }, 5000)
          } else if (status === 'CLOSED') {
            setIsConnected(false)
            console.log('🔌 Realtime connection closed')
          } else {
            setIsConnected(false)
          }
        })
    }

    setupChannel()

    // Cleanup on unmount
    return () => {
      console.log('🔌 Unsubscribing from users realtime')
      if (retryTimeout) clearTimeout(retryTimeout)
      if (channel) supabase.removeChannel(channel)
      setIsConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]) // Only re-subscribe if enabled changes, not filters

  const refetch = useCallback(() => {
    fetchUsers()
  }, [fetchUsers])

  return {
    users,
    loading,
    error,
    refetch,
    isConnected,
    count
  }
}

