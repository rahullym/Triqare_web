import { useState, useEffect, useCallback } from 'react'
import { Driver, DriverFilters, CreateDriverData, UpdateDriverData } from '@/services/driverService'

// Hook for fetching drivers with filters and pagination
export function useDrivers(filters: DriverFilters = {}) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)

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

  useEffect(() => {
    fetchDrivers()
  }, [fetchDrivers])

  const refetch = useCallback(() => {
    fetchDrivers()
  }, [fetchDrivers])

  return {
    drivers,
    loading,
    error,
    count,
    refetch
  }
}

// Hook for fetching a single driver
export function useDriver(id: string | null) {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDriver = useCallback(async () => {
    if (!id) {
      setDriver(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/drivers/${id}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch driver')
      }

      setDriver(data.driver)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      console.error('Error fetching driver:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDriver()
  }, [fetchDriver])

  const refetch = useCallback(() => {
    fetchDriver()
  }, [fetchDriver])

  return {
    driver,
    loading,
    error,
    refetch
  }
}

// Hook for creating drivers
export function useCreateDriver() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createDriver = useCallback(async (data: CreateDriverData) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/drivers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create driver')
      }

      return result.driver
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      console.error('Error creating driver:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    createDriver,
    loading,
    error
  }
}

// Hook for updating drivers
export function useUpdateDriver() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateDriver = useCallback(async (id: string, data: UpdateDriverData) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/drivers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update driver')
      }

      return result.driver
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      console.error('Error updating driver:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    updateDriver,
    loading,
    error
  }
}

// Hook for deleting drivers
export function useDeleteDriver() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteDriver = useCallback(async (id: string) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/drivers/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete driver')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      console.error('Error deleting driver:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    deleteDriver,
    loading,
    error
  }
}

// Hook for updating driver location
export function useUpdateDriverLocation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateLocation = useCallback(async (id: string, latitude: number, longitude: number) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/drivers/${id}/location`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ latitude, longitude }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update driver location')
      }

      return result.driver
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      console.error('Error updating driver location:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    updateLocation,
    loading,
    error
  }
}

// Hook for driver stats
export function useDriverStats() {
  const [stats, setStats] = useState<{
    total: number
    /** Raw drivers.status counts. NOT duty states — see driverPresence.ts. */
    available: number
    assigned: number
    inactive: number
    verified: number
    /** The four duty states. */
    on_trip: number
    on_duty: number
    needs_attention: number
    off_duty: number
    /** on_trip + on_duty. */
    dispatchable: number
    /** Subset of the dispatchable whose app is reporting positions right now. */
    live_gps: number
    /** Needs Attention, split by owner: the driver's phone, or our lookup. */
    no_device: number
    unchecked: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // `silent` refreshes keep the current tiles on screen instead of blanking them.
  const fetchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      setError(null)

      const response = await fetch('/api/drivers/stats')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch driver stats')
      }

      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      console.error('Error fetching driver stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const refetch = useCallback((silent = false) => {
    fetchStats(silent)
  }, [fetchStats])

  return {
    stats,
    loading,
    error,
    refetch
  }
}
