import { supabase } from '@/lib/supabase'

export interface Notification {
  id: string
  user_id: string
  type: 'emergency' | 'system' | 'assignment' | 'maintenance' | 'info'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  source?: string
  action_required: boolean
  action_url?: string
  read: boolean
  read_at?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CreateNotificationData {
  user_id: string
  type: Notification['type']
  priority: Notification['priority']
  title: string
  message: string
  source?: string
  action_required?: boolean
  action_url?: string
  metadata?: Record<string, any>
}

export interface NotificationFilters {
  type?: string
  priority?: string
  read?: boolean
  limit?: number
  offset?: number
}

export class NotificationService {
  /**
   * Get notifications for the current user
   */
  static async getNotifications(filters: NotificationFilters = {}) {
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters.type && filters.type !== 'all') {
        query = query.eq('type', filters.type)
      }

      if (filters.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority)
      }

      if (filters.read !== undefined) {
        query = query.eq('read', filters.read)
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit)
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
      }

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching notifications:', error)
        return { data: null, error: error.message, count: 0 }
      }

      return { data: data as Notification[], error: null, count: count || data?.length || 0 }
    } catch (error: any) {
      console.error('Error in getNotifications:', error)
      return { data: null, error: error.message, count: 0 }
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount() {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)

      if (error) {
        console.error('Error fetching unread count:', error)
        return { count: 0, error: error.message }
      }

      return { count: count || 0, error: null }
    } catch (error: any) {
      console.error('Error in getUnreadCount:', error)
      return { count: 0, error: error.message }
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId)
        .select()
        .single()

      if (error) {
        console.error('Error marking notification as read:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('Error in markAsRead:', error)
      return { data: null, error: error.message }
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('read', false)
        .select()

      if (error) {
        console.error('Error marking all as read:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('Error in markAllAsRead:', error)
      return { data: null, error: error.message }
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string) {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)

      if (error) {
        console.error('Error deleting notification:', error)
        return { error: error.message }
      }

      return { error: null }
    } catch (error: any) {
      console.error('Error in deleteNotification:', error)
      return { error: error.message }
    }
  }

  /**
   * Create notification (admin/system use)
   */
  static async createNotification(data: CreateNotificationData) {
    try {
      const { data: notification, error } = await supabase
        .from('notifications')
        .insert({
          user_id: data.user_id,
          type: data.type,
          priority: data.priority,
          title: data.title,
          message: data.message,
          source: data.source || 'System',
          action_required: data.action_required || false,
          action_url: data.action_url,
          metadata: data.metadata || {}
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating notification:', error)
        return { data: null, error: error.message }
      }

      return { data: notification, error: null }
    } catch (error: any) {
      console.error('Error in createNotification:', error)
      return { data: null, error: error.message }
    }
  }
}
