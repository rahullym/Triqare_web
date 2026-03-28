'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'
import { SOSService } from '@/services/sosService'
import { ERTDriverWithStatus, ERTDriverFilters, ERTDriverStats } from '@/hooks/useERTDrivers'

export interface UseERTDriversRealtimeOptions {
  enabled?: boolean
  filters?: ERTDriverFilters
  onInsert?: (driver: any) => void
  onUpdate?: (driver: any) => void
  onDelete?: (driverId: string) => void
}

export function useERTDriversRealtime(options: UseERTDriversRealtimeOptions = {}) {
  const { enabled = true, filters = {}, onInsert, onUpdate, onDelete } = options

  const [drivers, setDrivers] = useState<ERTDriverWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Fetch drivers function
  const fetchDrivers = useCallback(async () => {
    try {
      console.log('🔄 Fetching ERT drivers with status...')
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await SOSService.getAllDriversWithStatus()

      if (fetchError) {
        console.error('❌ Error fetching ERT drivers:', fetchError)
        setError(fetchError)
        return
      }

      console.log(`✅ Loaded ${data?.length || 0} ERT drivers`)
      setDrivers(data || [])
    } catch (err) {
      console.error('💥 Unexpected error fetching ERT drivers:', err)
      setError('Failed to fetch drivers')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch drivers when component mounts
  useEffect(() => {
    fetchDrivers()
  }, [fetchDrivers])

  // Setup realtime subscription (separate from data fetching)
  useEffect(() => {
    if (!enabled) {
      return
    }

    let driversChannel: RealtimeChannel
    let sosChannel: RealtimeChannel
    let retryTimeout: NodeJS.Timeout

    // Subscribe to drivers and sos_requests table changes
    const setupChannels = () => {
      console.log('📡 Setting up ERT Drivers Realtime subscriptions...')

      // Subscribe to drivers table
      driversChannel = supabase
        .channel('ert-drivers-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'drivers'
          },
          (payload) => {
            console.log('➕ Driver INSERT event:', payload)
            // Refetch to get complete driver data with joins
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
          (payload) => {
            console.log('🔄 Driver UPDATE event:', payload)
            // Refetch to get complete driver data with joins
            fetchDrivers()
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
          (payload) => {
            console.log('➖ Driver DELETE event:', payload)
            // Refetch to update the list
            fetchDrivers()
            if (onDelete) onDelete(payload.old.id)
          }
        )
        .subscribe((status, err) => {
          console.log('📡 ERT Drivers Realtime connection status:', status)

          if (status === 'SUBSCRIBED') {
            console.log('✅ Successfully connected to ERT Drivers Realtime')
            setIsConnected(true)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('❌ ERT Drivers Realtime connection error:', err)
            setIsConnected(false)
            // Retry connection after 5 seconds
            retryTimeout = setTimeout(() => {
              console.log('🔄 Retrying ERT Drivers Realtime connection...')
              setupChannels()
            }, 5000)
          } else if (status === 'CLOSED') {
            console.log('🔌 ERT Drivers Realtime connection closed')
            setIsConnected(false)
          }
        })

      // Subscribe to sos_requests table to detect driver assignments/status changes
      sosChannel = supabase
        .channel('ert-sos-drivers-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sos_requests'
          },
          (payload) => {
            console.log('🚨 SOS Request event (affects driver status):', payload.eventType)
            // Refetch drivers to update busy/available status
            fetchDrivers()
          }
        )
        .subscribe((status, err) => {
          console.log('📡 ERT SOS-Drivers Realtime connection status:', status)

          if (status === 'SUBSCRIBED') {
            console.log('✅ Successfully connected to ERT SOS-Drivers Realtime')
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('❌ ERT SOS-Drivers Realtime connection error:', err)
          }
        })
    }

    setupChannels()

    // Cleanup on unmount
    return () => {
      console.log('🔌 Unsubscribing from ERT Drivers Realtime')
      if (retryTimeout) clearTimeout(retryTimeout)
      if (driversChannel) supabase.removeChannel(driversChannel)
      if (sosChannel) supabase.removeChannel(sosChannel)
      setIsConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]) // Only re-subscribe if enabled changes

  // Filter drivers based on search and status
  const filteredDrivers = useMemo(() => {
    return drivers.filter(driver => {
      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase()
        const matchesSearch =
          driver.full_name?.toLowerCase().includes(searchTerm) ||
          driver.employee_id?.toLowerCase().includes(searchTerm) ||
          driver.email?.toLowerCase().includes(searchTerm) ||
          driver.phone?.toLowerCase().includes(searchTerm) ||
          driver.license_number?.toLowerCase().includes(searchTerm) ||
          driver.transport_company?.company_name?.toLowerCase().includes(searchTerm)

        if (!matchesSearch) return false
      }

      // Status filter
      if (filters.status && filters.status !== 'all') {
        if (driver.status !== filters.status) return false
      }

      // Shift filter - for now we'll skip this since drivers table doesn't have shift info
      if (filters.shift && filters.shift !== 'all') {
        // Skip shift filtering for now
      }

      // Location filters
      if (filters.country_id) {
        if (driver.country_id !== filters.country_id) return false
      }

      if (filters.state_id) {
        if (driver.state_id !== filters.state_id) return false
      }

      if (filters.city_id) {
        if (driver.city_id !== filters.city_id) return false
      }

      return true
    })
  }, [drivers, filters])

  // Calculate statistics
  const stats = useMemo((): ERTDriverStats => {
    const total = drivers.length
    const online = drivers.filter(d => d.status === 'online').length
    const offline = drivers.filter(d => d.status === 'offline').length
    const busy = drivers.filter(d => d.status === 'busy').length
    const avgRating = 0 // Not available in current schema

    return {
      total,
      online,
      offline,
      busy,
      avgRating
    }
  }, [drivers])

  return {
    drivers: filteredDrivers,
    allDrivers: drivers,
    loading,
    error,
    stats,
    refetch: fetchDrivers,
    isConnected
  }
}

