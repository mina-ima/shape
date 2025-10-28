// src/encode/encoder.ts
/* eslint-disable no-console */

type Mime = 'video/webm' | 'video/mp4';

export interface EncodeOptions { fps: number; preferredMime?: Mime; }
type EncodeInput = number | EncodeOptions;

const MIN_VALID_SIZE = 64 * 1024; // 小さすぎる動画は失敗扱い
const MIN_DURATION_SEC = 1;

function normalizeOptions(opts: EncodeInput): EncodeOptions {
  return typeof opts === 'number' ? { fps: opts } : opts;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  const platform = (navigator as any).platform || '';
  const iOSFamily = /\b(iPad|iPhone|iPod)\b/.test(ua) && !/Android/i.test(ua);
  const touchOnMac = /Macintosh/.test(ua) && 'ontouchend' in document;
  const applePlatform = /iPad|iPhone|iPod/.test(platform);
  return iOSFamily || touchOnMac || applePlatform;
}
function isAndroid(): boolean { return /Android/i.test(navigator.userAgent); }
export function getPreferredMimeType(): Mime {
  return (isIOS() || isAndroid()) ? 'video/mp4' : 'video/webm';
}
function altPreferred(mime: Mime): Mime { return mime === 'video/webm' ? 'video/mp4' : 'video/webm'; }

/* ---------- 公開API ---------- */

export async function encodeVideo(frames: any[], opts: EncodeInput): Promise<Blob> {
  const { blob } = await encodeVideoWithMeta(frames, normalizeOptions(opts));
  return blob;
}

export async function encodeVideoWithMeta(
  frames: any[],
  { fps, preferredMime }: EncodeOptions,
): Promise<{ blob: Blob; filename: string; mime: Mime }> {
  if (!frames?.length) throw new Error('encodeVideo: frames is empty');

  const primary: Mime = preferredMime ?? getPreferredMimeType();
  const secondary: Mime = altPreferred(primary);

  // 1) MediaRecorder を最優先（UIブロックが少なく速い）
  try {
    const mr = await import('./mediarec');
    const blob = await mr.encodeWithMediaRecorder(frames as any, fps, primary);
    console.log('[Encode] MediaRecorder blob:', blob?.type, blob?.size);
    if (blob && blob.size >= MIN_VALID_SIZE) {
      const mime = (blob.type || primary) as Mime;
      const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
      return { blob, filename, mime };
    }
    console.warn('[Encode] MediaRecorder output too small, fallback to ffmpeg…');
  } catch (e1) {
    console.warn(`[Encode] MediaRecorder failed (${(e1 as Error)?.message || e1}). Fallback to ffmpeg…`);
  }

  // 2) ffmpeg（単一JPEGルート）へ
  try {
    const { encodeWithFFmpegLoop } = await import('./ffmpeg_loop'); // 下の3)参照（ファイル名変更）
    const blob = await encodeWithFFmpegLoop(frames as any, fps, primary);
    if (blob && blob.size >= MIN_VALID_SIZE) {
      const mime = (blob.type || primary) as Mime;
      const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
      return { blob, filename, mime };
    }
    console.warn('[Encode] FFmpeg output too small, trying secondary mime…');
  } catch (e2) {
    console.warn(`[Encode] ffmpeg(${primary}) failed:`, e2);
  }

  // 3) 最後の手段：別MIMEで ffmpeg
  const { encodeWithFFmpegLoop } = await import('./ffmpeg_loop');
  const blob = await encodeWithFFmpegLoop(frames as any, fps, secondary);
  const mime = (blob.type || secondary) as Mime;
  const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
  return { blob, filename, mime };
}
