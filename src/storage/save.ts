// src/storage/save.ts

/** MIME種別 */
export enum MimeType {
  MP4 = "video/mp4",
  WebM = "video/webm",
  PNG = "image/png",
  JPEG = "image/jpeg",
}

/** MIME → 拡張子 */
function mimeToExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  const parts = m.split("/");
  return parts.length === 2 ? parts[1] : "bin";
}

/** ゼロ埋め */
function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

/** parallax_YYYYMMDD_HHMMSS */
export function generateFilename(mime: string): string {
  const d = new Date();
  const name =
    `parallax_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${name}.${mimeToExt(mime)}`;
}

/** <a download> フォールバック */
function fallbackAnchorDownload(blob: Blob, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = generateFilename(mime);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** MIME代替 (webm⇄mp4) */
function altMime(mime: string): string {
  if (mime.includes("webm")) return MimeType.MP4;
  if (mime.includes("mp4")) return MimeType.WebM;
  return mime;
}

/** showSaveFilePicker が使えるか */
function canUsePicker(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/** showSaveFilePicker 経由で保存（テスト互換：suggestedName のみ） */
async function saveWithPicker(blob: Blob, mime: string) {
  // @ts-ignore
  const picker = (window as any).showSaveFilePicker;
  const suggestedName = generateFilename(mime);
  const handle = await picker({ suggestedName });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** Blobを保存するユーティリティ */
export async function saveFile(
  blob: Blob,
  _filename?: string,
  mime: MimeType = MimeType.WebM
) {
  const file = new Blob([blob], { type: mime });

  // 1) showSaveFilePickerが使えるならそれを使う（types を渡さない）
  if (canUsePicker()) {
    try {
      await saveWithPicker(file, mime);
      return;
    } catch {
      // 2) 失敗したら代替MIMEで再試行
      try {
        await saveWithPicker(file, altMime(mime));
        return;
      } catch {
        // 3) さらに失敗したらフォールバック
        fallbackAnchorDownload(file, mime);
        return;
      }
    }
  }

  // 4) 非対応ブラウザは直接ダウンロード
  fallbackAnchorDownload(file, mime);
}
