import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadCsvInChunks } from '../uploadCsvInChunks'

function csvFile(): File {
  return new File(['company_name,email\na,a@b.com\n'], 'companies.csv', { type: 'text/csv' })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadCsvInChunks', () => {
  it('walks the whole file a chunk at a time and totals the results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: 3, failed: 0, errors: [], totalRows: 7, nextOffset: 3 }))
      .mockResolvedValueOnce(jsonResponse({ success: 2, failed: 1, errors: ['Row 5: bad email'], totalRows: 7, nextOffset: 6 }))
      .mockResolvedValueOnce(jsonResponse({ success: 1, failed: 0, errors: [], totalRows: 7, nextOffset: 7 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadCsvInChunks('/api/x/upload-csv', csvFile(), { chunkSize: 3 })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ success: 6, failed: 1, errors: ['Row 5: bad email'] })
  })

  it('sends the offset/limit window the server slices on', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: 2, failed: 0, errors: [], totalRows: 4, nextOffset: 2 }))
      .mockResolvedValueOnce(jsonResponse({ success: 2, failed: 0, errors: [], totalRows: 4, nextOffset: 4 }))
    vi.stubGlobal('fetch', fetchMock)

    await uploadCsvInChunks('/api/x/upload-csv', csvFile(), { chunkSize: 2 })

    const windows = fetchMock.mock.calls.map(([, init]) => {
      const body = init.body as FormData
      return [body.get('offset'), body.get('limit')]
    })
    expect(windows).toEqual([
      ['0', '2'],
      ['2', '2'],
    ])
  })

  it('reports progress as it goes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ success: 2, failed: 0, errors: [], totalRows: 3, nextOffset: 2 }))
        .mockResolvedValueOnce(jsonResponse({ success: 1, failed: 0, errors: [], totalRows: 3, nextOffset: 3 }))
    )

    const seen: Array<{ processed: number; total: number }> = []
    await uploadCsvInChunks('/api/x/upload-csv', csvFile(), { chunkSize: 2, onProgress: p => seen.push(p) })

    expect(seen).toEqual([
      { processed: 2, total: 3 },
      { processed: 3, total: 3 },
    ])
  })

  it('explains a timed-out chunk instead of reporting a bare network error', async () => {
    // A cut-off serverless function returns HTML/plain text, not JSON — calling
    // .json() on it is what used to surface as "Network error / 0 imported".
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ success: 3, failed: 0, errors: [], totalRows: 9, nextOffset: 3 }))
        .mockResolvedValueOnce(new Response('<html>Task timed out</html>', { status: 504 }))
    )

    const result = await uploadCsvInChunks('/api/x/upload-csv', csvFile(), { chunkSize: 3 })

    expect(result.success).toBe(3) // the rows that really did import are kept
    expect(result.errors[0]).toMatch(/took too long/i)
  })

  it('surfaces a rejected first chunk verbatim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'missing required column(s): email' }, 400)))

    const result = await uploadCsvInChunks('/api/x/upload-csv', csvFile())

    expect(result.success).toBe(0)
    expect(result.errors).toEqual(['missing required column(s): email'])
  })

  it('stops instead of spinning when the server reports no progress', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: 0, failed: 0, errors: [], totalRows: 2, nextOffset: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    await uploadCsvInChunks('/api/x/upload-csv', csvFile(), { chunkSize: 2 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
