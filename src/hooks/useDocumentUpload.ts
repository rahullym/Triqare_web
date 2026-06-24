'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_KEYS,
  MAX_FILE_BYTES,
  FILE_TOO_LARGE_MESSAGE,
  getDocumentTypeDef,
} from '@/lib/storage/driverDocuments'

export interface DocFile {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  path?: string
  error?: string
  /** Kept for retry + local preview (object URL). */
  file: File
}

export type DocsState = Record<string, DocFile[]>

function emptyState(): DocsState {
  const s: DocsState = {}
  for (const d of DOCUMENT_TYPES) s[d.key] = []
  return s
}

/** PUT a file to a Supabase signed upload URL with progress via XHR. */
function putWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl, true)
    xhr.setRequestHeader('x-upsert', 'true')
    if (file.type) xhr.setRequestHeader('content-type', file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(file)
  })
}

export function useDocumentUpload(draftId: string) {
  const [docs, setDocs] = useState<DocsState>(emptyState)

  const update = useCallback((type: string, id: string, patch: Partial<DocFile>) => {
    setDocs((prev) => ({
      ...prev,
      [type]: prev[type].map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
  }, [])

  const uploadOne = useCallback(
    async (type: string, entry: DocFile) => {
      const { file } = entry
      try {
        const res = await fetch('/api/drivers/applications/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, documentType: type, fileName: file.name, size: file.size }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || 'Could not prepare the upload.')
        }
        const { signedUrl, path } = (await res.json()) as { signedUrl: string; path: string }
        await putWithProgress(signedUrl, file, (pct) => update(type, entry.id, { progress: pct }))
        update(type, entry.id, { status: 'done', progress: 100, path })
      } catch (err) {
        const label = getDocumentTypeDef(type)?.label ?? 'document'
        // Surface the real reason. Only a genuine connectivity failure (XHR
        // `onerror` → "Network error") is phrased as an internet problem;
        // server/validation errors (e.g. "Could not prepare the upload.",
        // file-too-large, an HTTP status) are shown verbatim so the failure is
        // diagnosable instead of always blaming the user's connection.
        const reason =
          err instanceof Error && err.message && err.message !== 'Network error'
            ? err.message
            : `Upload failed for ${label}. Please check your internet connection and try again.`
        update(type, entry.id, { status: 'error', error: reason })
      }
    },
    [draftId, update],
  )

  const addFiles = useCallback(
    (type: string, fileList: FileList | File[]) => {
      const def = getDocumentTypeDef(type)
      if (!def) return
      const incoming = Array.from(fileList)
      setDocs((prev) => {
        const current = prev[type]
        const room = Math.max(0, def.maxFiles - current.length)
        const accepted = incoming.slice(0, room)
        const entries: DocFile[] = accepted.map((file) => {
          const tooBig = file.size > MAX_FILE_BYTES
          return {
            id: crypto.randomUUID(),
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            status: tooBig ? 'error' : 'uploading',
            progress: 0,
            error: tooBig ? FILE_TOO_LARGE_MESSAGE : undefined,
            file,
          }
        })
        // Kick off uploads for accepted, non-oversize files after state commit.
        queueMicrotask(() => {
          for (const e of entries) if (e.status === 'uploading') void uploadOne(type, e)
        })
        return { ...prev, [type]: [...current, ...entries] }
      })
    },
    [uploadOne],
  )

  const removeFile = useCallback((type: string, id: string) => {
    setDocs((prev) => ({ ...prev, [type]: prev[type].filter((f) => f.id !== id) }))
  }, [])

  const retryFile = useCallback(
    (type: string, id: string) => {
      setDocs((prev) => {
        const target = prev[type].find((f) => f.id === id)
        if (target) {
          queueMicrotask(() => void uploadOne(type, { ...target, status: 'uploading', progress: 0, error: undefined }))
        }
        return {
          ...prev,
          [type]: prev[type].map((f) =>
            f.id === id ? { ...f, status: 'uploading', progress: 0, error: undefined } : f,
          ),
        }
      })
    },
    [uploadOne],
  )

  const isUploading = useMemo(
    () => Object.values(docs).some((arr) => arr.some((f) => f.status === 'uploading')),
    [docs],
  )

  const allRequiredDone = useMemo(
    () => REQUIRED_DOCUMENT_KEYS.every((k) => docs[k]?.some((f) => f.status === 'done')),
    [docs],
  )

  const missingRequired = useMemo(
    () => REQUIRED_DOCUMENT_KEYS.filter((k) => !docs[k]?.some((f) => f.status === 'done')),
    [docs],
  )

  /** documentType -> array of uploaded draft paths (only `done` files). */
  const getDraftPaths = useCallback((): Record<string, string[]> => {
    const out: Record<string, string[]> = {}
    for (const [type, arr] of Object.entries(docs)) {
      const paths = arr.filter((f) => f.status === 'done' && f.path).map((f) => f.path as string)
      if (paths.length) out[type] = paths
    }
    return out
  }, [docs])

  return {
    docs,
    addFiles,
    removeFile,
    retryFile,
    isUploading,
    allRequiredDone,
    missingRequired,
    getDraftPaths,
  }
}
