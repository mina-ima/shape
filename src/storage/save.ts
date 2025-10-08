// ブラウザで Blob をファイル保存するユーティリティ
export enum MimeType {
  MP4 = "video/mp4",
  WebM = "video/webm",
  PNG = "image/png",
  JPEG = "image/jpeg"
}

export function saveFile(blob: Blob, filename: string, mime: MimeType = MimeType.WebM) {
  const file = new Blob([blob], { type: mime })
  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
  a.remove()
}
