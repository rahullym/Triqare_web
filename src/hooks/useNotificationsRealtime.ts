import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { NotificationService, type Notification, type NotificationFilters } from '@/services/notificationService'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface UseNotificationsRealtimeOptions {
  enabled?: boolean
  playAlertSound?: boolean
  onInsert?: (notification: Notification) => void
  onUpdate?: (notification: Notification) => void
  onDelete?: (notificationId: string) => void
}

export function useNotificationsRealtime(
  filters: NotificationFilters = {},
  options: UseNotificationsRealtimeOptions = {}
) {
  const {
    enabled = true,
    playAlertSound = false,
    onInsert,
    onUpdate,
    onDelete
  } = options

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Audio alert for new notifications
  const playAlert = useCallback(() => {
    if (!playAlertSound) return
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      console.error('Error playing alert sound:', error)
    }
  }, [playAlertSound])

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error: fetchError } = await NotificationService.getNotifications(filters)
      
      if (fetchError) {
        setError(fetchError)
        setNotifications([])
      } else {
        setNotifications(data || [])
        setError(null)
      }
    } catch (err: any) {
      setError(err.message)
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Setup realtime subscription
  useEffect(() => {
    // Initial fetch
    fetchNotifications()

    if (!enabled) {
      return
    }

    let channel: RealtimeChannel

    // Subscribe to notifications table changes
    channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🔔 NEW NOTIFICATION - Realtime INSERT:', payload.new)
          playAlert()
          fetchNotifications()
          if (onInsert) onInsert(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🔄 NOTIFICATION UPDATE - Realtime UPDATE:', payload.new)
          setNotifications(prev => prev.map(notif => 
            notif.id === payload.new.id 
              ? { ...notif, ...payload.new }
              : notif
          ))
          if (onUpdate) onUpdate(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('🗑️ NOTIFICATION DELETED - Realtime DELETE:', payload.old)
          setNotifications(prev => prev.filter(notif => notif.id !== payload.old.id))
          if (onDelete) onDelete(payload.old.id)
        }
      )
      .subscribe((status) => {
        console.log('📡 Notifications Realtime connection status:', status)
        setIsConnected(status === 'SUBSCRIBED')
      })

    // Cleanup on unmount
    return () => {
      console.log('🔌 Unsubscribing from notifications realtime')
      supabase.removeChannel(channel)
      setIsConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const refetch = useCallback(() => {
    fetchNotifications()
  }, [fetchNotifications])

  return {
    notifications,
    loading,
    error,
    refetch,
    isConnected
  }
}

