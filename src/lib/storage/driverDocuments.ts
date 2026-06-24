/**
 * Driver KYC document definitions + storage-path helpers.
 *
 * Import-safe on both client (form/hook) and server (routes) — no node-only
 * or 'server-only' imports. Files are stored in the PRIVATE `driver-documents`
 * bucket; the object key follows the spec layout:
 *   drivers/{reference_number}/{document_type}/{filename}
 * with in-flight uploads under a draft prefix:
 *   drivers/_drafts/{draftId}/{document_type}/{filename}
 */

export const DRIVER_DOCS_BUCKET = 'driver-documents'
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
export const FILE_TOO_LARGE_MESSAGE =
  'File too large to upload. Please compress file or use smaller file size.'

export interface DocumentTypeDef {
  /** Stable key used in storage paths and the documents map. */
  key: string
  /** Human label shown in the form and emails. */
  label: string
  /** Max files allowed in this field (front+back = 2, photos = 3). */
  maxFiles: number
}

export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  { key: 'registration_certificate', label: 'Vehicle Registration Certificate (RC)', maxFiles: 1 },
  { key: 'driving_license', label: 'Driving License (front and back)', maxFiles: 2 },
  { key: 'fitness_certificate', label: 'Vehicle Fitness Certificate', maxFiles: 1 },
  { key: 'puc_certificate', label: 'Pollution Under Control (PUC) Certificate', maxFiles: 1 },
  { key: 'ambulance_permit', label: 'Ambulance Permit', maxFiles: 1 },
  { key: 'interior_photos', label: 'Interior Vehicle Photographs', maxFiles: 3 },
  { key: 'exterior_photos', label: 'Exterior Vehicle Photographs', maxFiles: 3 },
  { key: 'police_verification', label: 'Police Verification Certificate', maxFiles: 1 },
  { key: 'aadhaar_card', label: 'Aadhaar Card (front and back)', maxFiles: 2 },
  { key: 'first_aid_certification', label: 'First Aid Certification', maxFiles: 1 },
]

export const DOCUMENT_TYPE_KEYS = DOCUMENT_TYPES.map((d) => d.key)
/**
 * Documents required for a valid submission. Currently empty — all KYC documents
 * are optional for now (applicants may submit without uploading anything). Add
 * keys here to re-enforce mandatory uploads later.
 */
export const REQUIRED_DOCUMENT_KEYS: string[] = []

export function isValidDocumentType(key: string): boolean {
  return DOCUMENT_TYPE_KEYS.includes(key)
}

export function getDocumentTypeDef(key: string): DocumentTypeDef | undefined {
  return DOCUMENT_TYPES.find((d) => d.key === key)
}

/** Lowercased extension (no dot) from a filename, or '' when absent. */
export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
}

/** Collision-resistant unique object name. */
export function uniqueFileName(originalName: string): string {
  const ext = fileExtension(originalName)
  const id = crypto.randomUUID()
  return ext ? `${id}.${ext}` : id
}

/** Draft object key for an in-flight upload (server builds this). */
export function draftObjectPath(draftId: string, documentType: string, originalName: string): string {
  return `drivers/_drafts/${draftId}/${documentType}/${uniqueFileName(originalName)}`
}

/** Final object key after submit, derived by reslotting a draft path under the reference number. */
export function finalObjectPath(referenceNumber: string, draftPath: string): string {
  // draftPath = drivers/_drafts/{draftId}/{documentType}/{filename}
  const parts = draftPath.split('/')
  const fileName = parts[parts.length - 1]
  const documentType = parts[parts.length - 2]
  return `drivers/${referenceNumber}/${documentType}/${fileName}`
}

/** Human-readable file size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
