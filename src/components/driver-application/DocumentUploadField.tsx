'use client'

import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, FileText, CheckCircle2, X, RotateCw } from 'lucide-react'
import type { DocumentTypeDef } from '@/lib/storage/driverDocuments'
import { formatFileSize } from '@/lib/storage/driverDocuments'
import type { DocFile } from '@/hooks/useDocumentUpload'

interface Props {
  def: DocumentTypeDef
  files: DocFile[]
  onAdd: (files: FileList) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  /** Show the red "*" marker — only for documents that are mandatory. */
  required?: boolean
  /** Highlight the field in red when a required doc is missing after a submit attempt. */
  invalid?: boolean
}

export function DocumentUploadField({ def, files, onAdd, onRemove, onRetry, required, invalid }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<DocFile | null>(null)

  const room = def.maxFiles - files.length
  const canAdd = room > 0
  const isSingle = def.maxFiles === 1

  const openPicker = (replace = false) => {
    if (replace) files.forEach((f) => onRemove(f.id))
    inputRef.current?.click()
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) onAdd(e.target.files)
    e.target.value = '' // allow re-picking the same file
  }

  const previewUrl = preview ? URL.createObjectURL(preview.file) : null
  const isImage = preview?.fileType.startsWith('image/')
  const isPdf = preview?.fileType === 'application/pdf'

  return (
    <div
      className={`rounded-md border p-3 ${invalid ? 'border-[#cc3333] bg-[#f5cccc]/10' : 'border-[#e6e6e6]'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-[#333333]">
          {def.label}
          {required && <span className="ml-0.5 text-[#cc3333]">*</span>}
          {def.maxFiles > 1 && (
            <span className="ml-1 text-xs font-normal text-[#999999]">(up to {def.maxFiles})</span>
          )}
        </div>
      </div>

      {/* Uploaded / in-flight files */}
      {files.length > 0 && (
        <ul className="mt-2 space-y-2">
          {files.map((f) => (
            <li key={f.id} className="rounded border border-[#e6e6e6] bg-white px-2.5 py-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-[#666666]" />
                <button
                  type="button"
                  onClick={() => setPreview(f)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-[#003366] hover:underline"
                  title="Click to preview"
                >
                  {f.fileName}
                </button>
                <span className="shrink-0 text-xs text-[#999999]">{formatFileSize(f.fileSize)}</span>
                {f.status === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  className="shrink-0 rounded p-0.5 text-[#999999] hover:bg-[#f5cccc]/40 hover:text-[#cc3333]"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {f.status === 'uploading' && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={f.progress} className="h-1.5" />
                  <span className="w-9 shrink-0 text-right text-xs text-[#666666]">{f.progress}%</span>
                </div>
              )}
              {f.status === 'error' && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-[#cc3333]">{f.error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRetry(f.id)}
                    className="h-7 border-[#cc3333] text-[#cc3333] hover:bg-[#f5cccc]/30"
                  >
                    <RotateCw className="mr-1 h-3 w-3" /> Retry
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Picker */}
      <input ref={inputRef} type="file" multiple={!isSingle} onChange={onPick} className="hidden" />
      <div className="mt-2">
        {canAdd ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openPicker(false)}
            className="border-dashed border-[#003366]/40 text-[#003366] hover:bg-[#ccd9e6]/30"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {files.length === 0 ? 'Choose file' : 'Add another'}
          </Button>
        ) : isSingle ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openPicker(true)}
            className="text-[#003366] hover:bg-[#ccd9e6]/30"
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Replace
          </Button>
        ) : null}
      </div>

      {/* Preview modal */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-base">{preview?.fileName}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            {previewUrl && isImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={preview?.fileName ?? ''} className="mx-auto max-h-[68vh] object-contain" />
            )}
            {previewUrl && isPdf && (
              <iframe src={previewUrl} title={preview?.fileName ?? 'preview'} className="h-[68vh] w-full" />
            )}
            {previewUrl && !isImage && !isPdf && (
              <p className="py-8 text-center text-sm text-[#666666]">
                Preview not available for this file type. It will be reviewed by the TriQare team.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
