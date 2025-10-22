// src/utils/saveBlob.ts
// 生成した Blob (動画など) をローカルへ保存するユーティリティ

export function saveBlob(blob: Blob, baseName = 'output') {
    // MIMEタイプから拡張子を判定
    const ext =
      blob.type === 'video/webm'
        ? 'webm'
        : blob.type === 'video/mp4'
        ? 'mp4'
        : 'bin';
  
    // 一時的なURLを作成してダウンロードリンクをクリック
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName}.${ext}`;
    a.style.display = 'none';
  
    document.body.appendChild(a);
    a.click();
  
    // クリーンアップ
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }
  