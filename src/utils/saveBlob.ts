// src/utils/saveBlob.ts
// 生成した Blob (動画など) をローカルへ保存するユーティリティ
// - 直後の revokeObjectURL でダウンロードが潰れないよう遅延
// - iOS/Safari では a.download が効かないケースに window.open でフォールバック

function isIOSLike(): boolean {
  const ua = navigator.userAgent;
  const platform = (navigator as any).platform || '';
  const iOSFamily = /\b(iPad|iPhone|iPod)\b/.test(ua) && !/Android/i.test(ua);
  const touchOnMac = /Macintosh/.test(ua) && 'ontouchend' in document;
  const applePlatform = /iPad|iPhone|iPod/.test(platform);
  return iOSFamily || touchOnMac || applePlatform;
}

function pickExt(mime: string): string {
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/mp4') return 'mp4';
  return 'bin';
}

export function saveBlob(blob: Blob, baseName = 'output', revokeDelayMs = 3000) {
  if (!blob || blob.size === 0) {
    console.warn('[saveBlob] empty blob; aborting download');
    return;
  }
  const ext = pickExt(blob.type || '');
  const url = URL.createObjectURL(blob);
  const filename = `${baseName}.${ext}`;

  // iOS/Safari フォールバック（a.download が効かない）
  if (isIOSLike()) {
    // 別タブで開いて「共有→ビデオを保存」等に委ねる
    const opened = window.open(url, '_blank');
    if (!opened) {
      // ポップアップブロック時は a を使うが、download 属性は無視されうる
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    }
    // 後始末は少し待つ（ダウンロード/表示の開始を待つ）
    setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);

  // クリックでダウンロード開始
  a.click();

  // 画面遷移/保存ダイアログで時間がかかる場合があるので遅延してクリーンアップ
  const cleanup = () => {
    URL.revokeObjectURL(url);
    if (a.parentNode) a.parentNode.removeChild(a);
    document.removeEventListener('visibilitychange', onVis);
  };
  const onVis = () => {
    // 画面が非表示になった（保存ダイアログ/別タブ）タイミングでも掃除
    if (document.hidden) {
      setTimeout(cleanup, 1000);
    }
  };
  document.addEventListener('visibilitychange', onVis);
  setTimeout(cleanup, revokeDelayMs);
}
