'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PaginationWithInfo } from '@/components/ui/pagination'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useServerPagination } from '@/hooks/useServerPagination'
import {
  Users,
  UserPlus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Shield,
  Mail,
  Phone,
  Calendar,
  Loader2,
  AlertCircle,
  Ban,
  CheckCircle
} from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { UserService } from '@/services/userService'
import { DatabaseUser } from '@/lib/supabase'
import { useUsersRealtime } from '@/hooks/useUsersRealtime'
import { toast } from 'sonner'

interface EnrichedUser extends DatabaseUser {
  banned?: boolean
  lastSignInAt?: number
  clerkUserNotFound?: boolean
}

export default function AdminUsersPage() {
  const [enrichedUsers, setEnrichedUsers] = useState<EnrichedUser[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<DatabaseUser | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toggleStatusLoading, setToggleStatusLoading] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    total: number
    byRole: Record<string, number>
    recentUsers: number
  } | null>(null)

  // Pagination state
  const { currentPage, pageSize, setCurrentPage, setPageSize } = useServerPagination()

  // Memoize filters to prevent unnecessary re-subscriptions
  const realtimeFilters = useMemo(() => ({
    role: roleFilter || undefined,
    search: searchQuery || undefined,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize
  }), [roleFilter, searchQuery, pageSize, currentPage])

  // Use realtime hook for users
  const { users, loading, error, refetch, isConnected, count } = useUsersRealtime({
    enabled: true,
    filters: realtimeFilters,
    onInsert: (user) => {
      toast.success(`New user added: ${user.full_name || user.email}`)
    },
    onUpdate: (user) => {
      toast.info(`User updated: ${user.full_name || user.email}`)
    },
    onDelete: (userId) => {
      toast.info('User deleted')
    }
  })

  // Pagination calculations
  const totalPages = Math.ceil(count / pageSize)
  const hasNextPage = currentPage < totalPages
  const hasPreviousPage = currentPage > 1
  const startIndex = count > 0 ? (currentPage - 1) * pageSize + 1 : 0
  const endIndex = Math.min(currentPage * pageSize, count)

  // Enrich users with Clerk status (banned, lastSignInAt, etc.)
  const enrichUsers = useCallback(async () => {
    if (users.length === 0) {
      setEnrichedUsers([])
      return
    }

    try {
      // Build query parameters
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((currentPage - 1) * pageSize).toString()
      })
      if (roleFilter) params.append('role', roleFilter)
      if (searchQuery) params.append('search', searchQuery)

      const response = await fetch(`/api/admin/users/list-with-status?${params.toString()}`)
      const result = await response.json()

      if (response.ok && result.data) {
        setEnrichedUsers(result.data)
      } else {
        // Fallback to non-enriched users if API fails
        setEnrichedUsers(users as EnrichedUser[])
      }
    } catch (err) {
      console.error('Failed to enrich users:', err)
      // Fallback to non-enriched users
      setEnrichedUsers(users as EnrichedUser[])
    }
  }, [users, roleFilter, searchQuery, pageSize, currentPage])

  const loadStats = useCallback(async () => {
    try {
      const { data, error } = await UserService.getUserStats()
      if (error) {
        console.error('Failed to load stats:', error)
      } else {
        setStats(data)
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }, [])

  // Enrich users when base users change
  useEffect(() => {
    enrichUsers()
  }, [enrichUsers])

  // Load stats on mount
  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleSearch = () => {
    setCurrentPage(1) // Reset to first page on search
  }

  const handleDeleteClick = (user: DatabaseUser) => {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return

    setDeleteLoading(true)
    try {
      const { error } = await UserService.deleteUser(userToDelete.id)
      if (error) {
        toast.error('Failed to delete user: ' + error)
      } else {
        toast.success('User deleted successfully')
        setDeleteDialogOpen(false)
        setUserToDelete(null)
        // Realtime hook will automatically update the list
      }
    } catch (err) {
      toast.error('Failed to delete user')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setUserToDelete(null)
  }

  const handleToggleStatus = async (user: DatabaseUser, action: 'ban' | 'unban') => {
    setToggleStatusLoading(user.id)
    try {
      const response = await fetch('/api/admin/users/toggle-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clerkUserId: user.clerk_user_id,
          action
        })
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to update user status')
      } else {
        toast.success(`User ${action === 'ban' ? 'deactivated' : 'activated'} successfully`)
        // Realtime hook will automatically update the list
        // But we also manually enrich to get the latest Clerk status
        enrichUsers()
      }
    } catch (err) {
      toast.error('Failed to update user status')
    } finally {
      setToggleStatusLoading(null)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800'
      case 'ert': return 'bg-blue-100 text-blue-800'
      case 'transport_company': return 'bg-green-100 text-green-800'
      case 'patient': return 'bg-purple-100 text-purple-800'
      case 'driver': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrator'
      case 'ert': return 'ERT Member'
      case 'transport_company': return 'Transport Company'
      case 'patient': return 'Patient'
      case 'driver': return 'Driver'
      default: return 'User'
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'suspended': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">
                👥 User Management
              </h1>
              {/* Realtime Connection Status */}
              {isConnected && (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                  Live
                </Badge>
              )}
              {!isConnected && !loading && (
                <Badge variant="secondary" className="bg-red-100 text-red-600">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-2" />
                  Offline
                </Badge>
              )}
            </div>
            <p className="text-gray-600">
              Manage system users, roles, and permissions
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-red-100 text-red-800">
              <Shield className="h-3 w-3 mr-1" />
              Admin Only
            </Badge>
            <Link href="/admin/users/add">
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Add New User
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                Registered users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Users</CardTitle>
              <Calendar className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats?.recentUsers || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Last 7 days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ERT Members</CardTitle>
              <Shield className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {stats?.byRole?.ert || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Emergency response team
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transport Companies</CardTitle>
              <Users className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {users.filter(u => u.role === 'transport_company').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Transport partners
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-md"
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="ert">ERT</option>
                <option value="transport_company">Transport Company</option>
                <option value="patient">Patient</option>
                <option value="driver">Driver</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Users ({count})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Loading users...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-8 text-red-600">
                <AlertCircle className="h-8 w-8 mr-2" />
                <span>{error}</span>
              </div>
            ) : enrichedUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No users found
              </div>
            ) : (
              <div className="space-y-4">
                {enrichedUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                        {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('') : user.email ? user.email[0].toUpperCase() : '?'}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{user.full_name || user.email || 'Unknown User'}</h4>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {user.email}
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(user.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge className={getRoleBadgeColor(user.role)}>
                            {getRoleDisplayName(user.role)}
                          </Badge>
                          {user.banned ? (
                            <Badge className="bg-red-100 text-red-800">
                              <Ban className="h-3 w-3 mr-1" />
                              Deactivated
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                          {user.clerkUserNotFound && (
                            <Badge className="bg-yellow-100 text-yellow-800">
                              ⚠️ Clerk User Missing
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">
                        <div>ID: {user.id.slice(0, 8)}...</div>
                        <div>Created: {new Date(user.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {user.banned ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(user, 'unban')}
                            disabled={toggleStatusLoading === user.id || user.clerkUserNotFound}
                            className="text-green-600 hover:text-green-700"
                          >
                            {toggleStatusLoading === user.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4 mr-1" />
                            )}
                            Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(user, 'ban')}
                            disabled={toggleStatusLoading === user.id || user.role === 'admin' || user.clerkUserNotFound}
                            className="text-orange-600 hover:text-orange-700"
                          >
                            {toggleStatusLoading === user.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Ban className="h-4 w-4 mr-1" />
                            )}
                            Deactivate
                          </Button>
                        )}
                        <Link href={`/admin/users/${user.id}/edit`}>
                          <Button size="sm" variant="outline">
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteClick(user)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {!loading && !error && count > 0 && (
              <div className="mt-6">
                <PaginationWithInfo
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  hasNextPage={hasNextPage}
                  hasPreviousPage={hasPreviousPage}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  totalItems={count}
                  pageSize={pageSize}
                  pageSizeOptions={[5, 10, 20, 50, 100]}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>User Management Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button variant="outline" className="h-20 flex-col">
                <UserPlus className="h-6 w-6 mb-2" />
                Add New User
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Shield className="h-6 w-6 mb-2" />
                Manage Roles
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Mail className="h-6 w-6 mb-2" />
                Send Invitations
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Users className="h-6 w-6 mb-2" />
                Bulk Actions
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{userToDelete?.full_name}</strong>?
                This action cannot be undone and will permanently remove the user from the system.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete User
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}
