/**
 * Walk a CSV import endpoint a few rows at a time.
 *
 * WHY THIS EXISTS. Bulk import provisions a login per row (GoTrue createUser plus
 * several database round trips). A dozen rows in a single request outlives the
 * hosting platform's serverless function timeout, and a timed-out request has no
 * JSON body to read — so `response.json()` threw and the dialog reported
 * "Network error / 0 imported" for an upload that was merely too big to finish in
 * one call. Rows already written before the cut stayed written, which made the
 * message actively misleading.
 *
 * Sending the same file with an `offset`/`limit` window keeps each request short,
 * lets the operator watch progress, and — when something does go wrong halfway —
 * reports the rows that did import instead of claiming none did.
 *
 * The file is re-sent per chunk rather than split client-side on purpose: the
 * server owns CSV parsing (quoted commas, embedded newlines), and splitting text
 * in the browser would fork that logic.
 */

export interface CsvChunkProgress {
  /** Rows attempted so far (across finished chunks). */
  processed: number
  /** Total data rows in the file, once the first response reveals it. */
  total: number
}

export interface CsvUploadOutcome {
  success: number
  failed: number
  errors: string[]
}

/** Small enough that a chunk finishes well inside a 10s function timeout. */
const DEFAULT_CHUNK_SIZE = 3

/**
 * Read an error out of a response that may not be JSON at all — a gateway
 * timeout or crash returns HTML or plain text, and blindly calling .json() on it
 * is what produced the meaningless "Network error".
 */
async function describeFailure(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')
  try {
    const parsed = JSON.parse(body)
    if (parsed?.error) return String(parsed.error)
  } catch {
    // not JSON — fall through to the status-based message
  }
  if (response.status === 502 || response.status === 504) {
    return 'The server took too long to respond. Some rows may not have been imported — reload the list before retrying.'
  }
  const snippet = body.trim().slice(0, 200)
  return `Upload failed (HTTP ${response.status})${snippet ? `: ${snippet}` : ''}`
}

export async function uploadCsvInChunks(
  endpoint: string,
  file: File,
  options: { chunkSize?: number; onProgress?: (progress: CsvChunkProgress) => void } = {}
): Promise<CsvUploadOutcome> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const outcome: CsvUploadOutcome = { success: 0, failed: 0, errors: [] }

  let offset = 0
  let total = Number.POSITIVE_INFINITY

  while (offset < total) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('offset', String(offset))
    formData.append('limit', String(chunkSize))

    let response: Response
    try {
      response = await fetch(endpoint, { method: 'POST', body: formData })
    } catch {
      outcome.errors.push(
        offset === 0
          ? 'Could not reach the server. Check your connection and try again.'
          : `Connection lost after ${offset} row(s). Reload the list to see what was imported.`
      )
      outcome.failed += 1
      return outcome
    }

    if (!response.ok) {
      outcome.errors.push(await describeFailure(response))
      // A rejected FIRST chunk is a whole-file problem (bad headers, empty file);
      // there is nothing to keep walking through.
      outcome.failed += 1
      return outcome
    }

    const result = await response.json().catch(() => null)
    if (!result) {
      outcome.errors.push('The server returned a response that could not be read.')
      outcome.failed += 1
      return outcome
    }

    outcome.success += result.success ?? 0
    outcome.failed += result.failed ?? 0
    if (Array.isArray(result.errors)) outcome.errors.push(...result.errors)

    total = Number.isFinite(result.totalRows) ? result.totalRows : offset + chunkSize
    const advanced = result.nextOffset ?? offset + chunkSize
    // Guard against a server that reports no progress, which would spin forever.
    offset = advanced > offset ? advanced : offset + chunkSize

    options.onProgress?.({ processed: Math.min(offset, total), total })
  }

  return outcome
}
