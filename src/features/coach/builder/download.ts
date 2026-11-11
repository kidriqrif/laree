/** Hands a generated file to the browser: Blob, object URL, temporary link, URL revoked afterwards. */
export interface DownloadableFile {
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

export const REVOKE_AFTER_MS = 10_000

export function downloadFile(file: DownloadableFile): void {
  const blob = new Blob([file.bytes as BlobPart], { type: file.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
