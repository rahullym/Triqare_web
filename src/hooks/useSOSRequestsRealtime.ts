import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { SOSRequest } from '@/services/sosService'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface UseSOSRequestsRealtimeOptions {
  enabled?: boolean
  onInsert?: (sosRequest: any) => void
  onUpdate?: (sosRequest: any) => void
  onDelete?: (sosRequestId: string) => void
  playAlertSound?: boolean
}

/**
 * Hook for fetching SOS requests with real-time updates via Supabase Realtime
 * 
 * CRITICAL for emergency response - ensures ER team sees new emergencies instantly!
 * 
 * Features:
 * - Initial data fetch
 * - Real-time INSERT subscriptions (new emergencies appear instantly)
 * - Real-time UPDATE subscriptions (status changes sync across all clients)
 * - Real-time DELETE subscriptions (cancellations sync instantly)
 * - Connection status tracking
 * - Optional audio alerts for new emergencies
 * - Automatic cleanup on unmount
 * 
 * @param options - Realtime options (enabled, callbacks, alerts)
 */
export function useSOSRequestsRealtime(
  options: UseSOSRequestsRealtimeOptions = {}
) {
  const { enabled = true, onInsert, onUpdate, onDelete, playAlertSound = true } = options

  const [sosRequests, setSOSRequests] = useState<SOSRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Play alert sound for new emergency
  const playAlert = useCallback(() => {
    if (playAlertSound && typeof window !== 'undefined') {
      try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        
        oscillator.frequency.value = 800 // Frequency in Hz
        oscillator.type = 'sine'
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
        
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.5)
      } catch (err) {
        console.error('Failed to play alert sound:', err)
      }
    }
  }, [playAlertSound])

  // Fetch SOS requests from service
  const fetchSOSRequests = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Import dynamically to avoid circular dependencies
      const { SOSService } = await import('@/services/sosService')
      const result = await SOSService.getSOSRequests()

      if (result.error) {
        throw new Error(result.error)
      }

      setSOSRequests(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      console.error('Error fetching SOS requests:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Handle realtime INSERT (NEW EMERGENCY!)
  const handleInsert = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    console.log('🚨 NEW EMERGENCY - Realtime INSERT:', payload.new)
    
    // Play alert sound
    playAlert()
    
    // Refetch to get complete data with relations
    fetchSOSRequests()
    
    // Call custom callback
    if (onInsert) {
      onInsert(payload.new)
    }
  }, [fetchSOSRequests, onInsert, playAlert])

  // Handle realtime UPDATE (status change, driver assignment, etc.)
  const handleUpdate = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    console.log('🔄 SOS UPDATE - Realtime UPDATE:', payload.new)
    
    setSOSRequests(prev => prev.map(sos => 
      sos.id === payload.new.id 
        ? { ...sos, ...payload.new }
        : sos
    ))
    
    // Call custom callback
    if (onUpdate) {
      onUpdate(payload.new)
    }
  }, [onUpdate])

  // Handle realtime DELETE (cancellation)
  const handleDelete = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    console.log('❌ SOS CANCELLED - Realtime DELETE:', payload.old)

    const deletedId = (payload.old as any)?.id
    if (deletedId) {
      setSOSRequests(prev => prev.filter(sos => sos.id !== deletedId))

      // Call custom callback
      if (onDelete) {
        onDelete(deletedId)
      }
    }
  }, [onDelete])

  // Setup realtime subscription
  useEffect(() => {
    // Initial fetch
    fetchSOSRequests()

    if (!enabled) {
      return
    }

    let channel: RealtimeChannel

    // Subscribe to sos_requests table changes
    channel = supabase
      .channel('sos-requests-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sos_requests'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🚨 NEW EMERGENCY - Realtime INSERT:', payload.new)
          playAlert()
          fetchSOSRequests()
          if (onInsert) onInsert(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sos_requests'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🔄 SOS UPDATE - Realtime UPDATE:', payload.new)
          setSOSRequests(prev => prev.map(sos =>
            sos.id === payload.new.id
              ? { ...sos, ...payload.new }
              : sos
          ))
          if (onUpdate) onUpdate(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'sos_requests'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('❌ SOS CANCELLED - Realtime DELETE:', payload.old)
          const deletedId = (payload.old as any)?.id
          if (deletedId) {
            setSOSRequests(prev => prev.filter(sos => sos.id !== deletedId))
            if (onDelete) onDelete(deletedId)
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 SOS Realtime connection status:', status)
        setIsConnected(status === 'SUBSCRIBED')
      })

    // Cleanup on unmount
    return () => {
      console.log('🔌 Unsubscribing from SOS realtime')
      supabase.removeChannel(channel)
      setIsConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const refetch = useCallback(() => {
    fetchSOSRequests()
  }, [fetchSOSRequests])

  return {
    sosRequests,
    loading,
    error,
    refetch,
    isConnected
  }
}

