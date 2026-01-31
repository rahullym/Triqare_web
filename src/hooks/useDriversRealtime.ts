import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Driver, DriverFilters } from '@/services/driverService'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface UseDriversRealtimeOptions {
  enabled?: boolean
  onInsert?: (driver: any) => void
  onUpdate?: (driver: any) => void
  onDelete?: (driverId: string) => void
}

/**
 * Hook for fetching drivers with real-time updates via Supabase Realtime
 * 
 * Features:
 * - Initial data fetch
 * - Real-time INSERT, UPDATE, DELETE subscriptions
 * - Automatic UI updates when data changes
 * - Connection status tracking
 * - Automatic cleanup on unmount
 * 
 * @param filters - Driver filters (search, status, company, etc.)
 * @param options - Realtime options (enabled, callbacks)
 */
export function useDriversRealtime(
  filters: DriverFilters = {},
  options: UseDriversRealtimeOptions = {}
) {
  const { enabled = true, onInsert, onUpdate, onDelete } = options

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)

  // Fetch drivers from API
  const fetchDrivers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (filters.search) params.append('search', filters.search)
      if (filters.status) params.append('status', filters.status)
      if (filters.transport_company_id) params.append('transport_company_id', filters.transport_company_id)
      if (filters.is_verified !== undefined) params.append('is_verified', filters.is_verified.toString())
      if (filters.country_id) params.append('country_id', filters.country_id)
      if (filters.state_id) params.append('state_id', filters.state_id)
      if (filters.city_id) params.append('city_id', filters.city_id)
      if (filters.limit) params.append('limit', filters.limit.toString())
      if (filters.offset) params.append('offset', filters.offset.toString())

      const response = await fetch(`/api/drivers?${params.toString()}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch drivers')
      }

      setDrivers(data.drivers)
      setCount(data.count)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      console.error('Error fetching drivers:', err)
    } finally {
      setLoading(false)
    }
  }, [filters.search, filters.status, filters.transport_company_id, filters.is_verified, filters.country_id, filters.state_id, filters.city_id, filters.limit, filters.offset])

  // Handle realtime INSERT
  const handleInsert = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    console.log('🔵 Realtime INSERT:', payload.new)
    
    // Refetch to get complete data with relations
    fetchDrivers()
    
    // Call custom callback
    if (onInsert) {
      onInsert(payload.new)
    }
  }, [fetchDrivers, onInsert])

  // Handle realtime UPDATE
  const handleUpdate = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    console.log('🟡 Realtime UPDATE:', payload.new)
    
    setDrivers(prev => prev.map(driver => 
      driver.user_id === payload.new.user_id 
        ? { ...driver, ...payload.new }
        : driver
    ))
    
    // Call custom callback
    if (onUpdate) {
      onUpdate(payload.new)
    }
  }, [onUpdate])

  // Handle realtime DELETE
  const handleDelete = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    console.log('🔴 Realtime DELETE:', payload.old)
    
    setDrivers(prev => prev.filter(driver => driver.user_id !== payload.old.user_id))
    setCount(prev => Math.max(0, prev - 1))
    
    // Call custom callback
    if (onDelete) {
      onDelete(payload.old.user_id)
    }
  }, [onDelete])

  // Setup realtime subscription
  useEffect(() => {
    // Initial fetch
    fetchDrivers()

    if (!enabled) {
      return
    }

    let channel: RealtimeChannel

    // Subscribe to drivers table changes
    channel = supabase
      .channel('drivers-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'drivers'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🔵 Realtime INSERT:', payload.new)
          fetchDrivers()
          if (onInsert) onInsert(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🟡 Realtime UPDATE:', payload.new)
          setDrivers(prev => prev.map(driver =>
            driver.user_id === payload.new.user_id
              ? { ...driver, ...payload.new }
              : driver
          ))
          if (onUpdate) onUpdate(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'drivers'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🔴 Realtime DELETE:', payload.old)
          setDrivers(prev => prev.filter(driver => driver.user_id !== payload.old.user_id))
          setCount(prev => Math.max(0, prev - 1))
          if (onDelete) onDelete(payload.old.user_id)
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime connection status:', status)
        setIsConnected(status === 'SUBSCRIBED')
      })

    // Cleanup on unmount
    return () => {
      console.log('🔌 Unsubscribing from realtime')
      supabase.removeChannel(channel)
      setIsConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const refetch = useCallback(() => {
    fetchDrivers()
  }, [fetchDrivers])

  return {
    drivers,
    loading,
    error,
    count,
    refetch,
    isConnected
  }
}

