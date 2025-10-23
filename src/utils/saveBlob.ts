// src/utils/saveBlob.ts
// 生成した Blob(動画など) をローカルへ保存するユーティリティ
// - MIMEから拡張子を推定（"video/mp4; codecs=…" 等も考慮）
// - ファイル名をサニタイズ
// - iOS/Safari など download 属性が効かない環境でのフォールバック

/** MIME から拡張子を推定 */
export function inferExtFromMime(mime?: string): 'mp4' | 'webm' | 'bin' {
  if (!mime) return 'bin';
  const m = mime.toLowerCase();
  if (m.includes('video/mp4')) return 'mp4';
  if (m.includes('video/webm')) return 'webm';
  return 'bin';
}

/** ベース名のサニタイズ（パス区切りや制御文字などを除去） */
export function sanitizeBaseName(name?: string): string {
  const raw = (name ?? 'output').trim();
  // パス区切り・制御・不可文字を取り除き、連続空白はハイフン化
  return raw
    .replace(/[/\\?%*:|"<>]/g, ' ')      // Windows 禁止文字も含め除去
    .replace(/\s+/g, '-')                // 連続空白→ハイフン
    .replace(/^\.+/, '')                 // 先頭ドットを回避
    .slice(0, 128) || 'output';
}

/** download属性が効かなそうな環境判定（緩め） */
function isDownloadAttrSupported(): boolean {
  try {
    const a = document.createElement('a');
    return typeof (a as HTMLAnchorElement).download !== 'undefined';
  } catch {
    return false;
  }
}

/** iOS系の簡易判定（フォールバック判断用） */
function isLikelyIOS(): boolean {
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).platform || '';
  const iOSFamily = /\b(iPad|iPhone|iPod)\b/i.test(ua) && !/Android/i.test(ua);
  const touchOnMac = /Macintosh/i.test(ua) && 'ontouchend' in document;
  const applePlatform = /iPad|iPhone|iPod/i.test(platform);
  return iOSFamily || touchOnMac || applePlatform;
}

/**
 * Blob を保存する
 * @param blob  保存対象 Blob
 * @param baseName  拡張子抜きのファイル名（未指定は "output"）
 */
export async function saveBlob(blob: Blob, baseName = 'output'): Promise<void> {
  const ext = inferExtFromMime(blob.type);
  const safeBase = sanitizeBaseName(baseName);
  const filename = `${safeBase}.${ext}`;

  // ObjectURL を生成
  const url = URL.createObjectURL(blob);

  // download 属性が使える場合は a.click() を使用
  if (isDownloadAttrSupported() && !isLikelyIOS()) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // クリーンアップは少し遅延して互換性を担保
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 0);
    return;
  }

  // フォールバック：新規タブ/ウィンドウで開く（iOS/Safari など）
  // ユーザーは表示された動画から「共有」→「ビデオを保存」で保存可能
  try {
    const opened = window.open(url, '_blank');
    if (!opened) {
      // ポップアップブロック時は最後の手段で a.click()
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      if (a.parentNode) a.parentNode.removeChild(a);
    }
  } finally {
    // iOSでは即 revoke すると表示できない場合があるため、少し待つ
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
