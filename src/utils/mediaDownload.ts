// src/utils/mediaDownload.ts
/* ダウンロード/再生の共通ユーティリティ（iOS/Android/PCで安定挙動） */

export type VideoMeta = {
    blob: Blob;
    filename?: string;   // 例: output.webm / output.mp4
  };
  
  /** Blob → objectURL を生成（呼び元で revoke すること） */
  export function toObjectURL(meta: VideoMeta): { url: string; filename: string; mime: string } {
    const mime = meta.blob.type || 'application/octet-stream';
    const url = URL.createObjectURL(meta.blob);
    const fallbackExt = mime.startsWith('video/mp4') ? 'mp4' : mime.startsWith('video/webm') ? 'webm' : 'bin';
    const filename = meta.filename?.trim() || `output.${fallbackExt}`;
    return { url, filename, mime };
  }
  
  /** <video> にプレビュー用URLをセット（古いURLはrevoke） */
  export function bindVideoSource(videoEl: HTMLVideoElement, meta: VideoMeta, prevUrl?: string | null): string {
    if (prevUrl) {
      try { URL.revokeObjectURL(prevUrl); } catch {}
    }
    const { url } = toObjectURL(meta);
    // iOS対策：先に空→load→設定の順で安定
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.src = url;
    // 自動で再生はしない（ユーザー操作で再生させる）
    return url;
  }
  
  /** <a download> にダウンロードURLをセット（古いURLはrevoke） */
  export function bindDownloadAnchor(anchorEl: HTMLAnchorElement, meta: VideoMeta, prevUrl?: string | null): string {
    if (prevUrl) {
      try { URL.revokeObjectURL(prevUrl); } catch {}
    }
    const { url, filename } = toObjectURL(meta);
    anchorEl.href = url;
    anchorEl.download = filename;
    // iOS Safari は download属性を無視 → onClick時フォールバック
    return url;
  }
  
  /** iOS Safari 用のフォールバック：新規タブで再生/保存 */
  export function openInNewTab(meta: VideoMeta): void {
    const { url } = toObjectURL(meta);
    // window.open の戻り値チェック（ポップアップブロック回避はユーザー操作イベント内で呼ぶこと）
    const w = window.open(url, '_blank');
    if (!w) {
      // ブロックされた場合は location.href で遷移
      location.href = url;
    }
  }
  