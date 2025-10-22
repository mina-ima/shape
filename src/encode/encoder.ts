/* eslint-disable no-console */
import { createFFmpeg } from '@ffmpeg/ffmpeg';

type Mime = 'video/webm' | 'video/mp4';

export interface EncodeOptions {
  fps: number;
  preferredMime?: Mime; // 明示指定があれば優先
}

/* ---------------- 判定ユーティリティ ---------------- */

// iOS厳密判定：Android誤検出を避ける
function isIOS(): boolean {
  const ua = navigator.userAgent;
  const platform = (navigator as any).platform || '';
  const iOSFamily = /\b(iPad|iPhone|iPod)\b/.test(ua) && !/Android/i.test(ua);
  const touchOnMac = /Macintosh/.test(ua) && 'ontouchend' in document;
  const applePlatform = /iPad|iPhone|iPod/.test(platform);
  return iOSFamily || touchOnMac || applePlatform;
}

// captureStream の存在チェック（Android WebView など未実装対策）
function canCaptureStream(): boolean {
  const htmlCanvasProto = (HTMLCanvasElement as any)?.prototype;
  const offscreenProto = (globalThis as any).OffscreenCanvas?.prototype;
  return (
    typeof htmlCanvasProto?.captureStream === 'function' ||
    typeof offscreenProto?.captureStream === 'function'
  );
}

export function getPreferredMimeType(): Mime {
  // iOSはMP4、それ以外（Android含む）はWebM優先
  return isIOS() ? 'video/mp4' : 'video/webm';
}

function alternativeOf(mime: Mime): Mime {
  return mime === 'video/webm' ? 'video/mp4' : 'video/webm';
}

function extOf(mime: Mime): 'webm' | 'mp4' {
  return mime === 'video/webm' ? 'webm' : 'mp4';
}

/* ---------------- パブリックAPI ---------------- */

// frames: drawImage可能なソース(Canvas/ImageBitmap/HTMLVideoElement等)
export async function encodeVideo(
  frames: CanvasImageSource[],
  { fps, preferredMime }: EncodeOptions,
): Promise<{ blob: Blob; filename: string; mime: Mime }> {
  if (!frames?.length) {
    throw new Error('encodeVideo: frames is empty');
  }

  const primary: Mime = (preferredMime ?? getPreferredMimeType());
  const secondary: Mime = alternativeOf(primary);

  // 1) MediaRecorder（captureStream必須）
  if (typeof (globalThis as any).MediaRecorder === 'function' && canCaptureStream()) {
    try {
      const blob = await encodeWithMediaRecorder(frames, fps, primary);
      console.log(`Encoded with MediaRecorder as ${primary}`);
      return { blob, filename: `output.${extOf(primary)}`, mime: primary };
    } catch (e1) {
      console.warn(`MediaRecorder failed with ${primary}`, e1);
      try {
        const blob = await encodeWithMediaRecorder(frames, fps, secondary);
        console.log(`Encoded with MediaRecorder as ${secondary}`);
        return { blob, filename: `output.${extOf(secondary)}`, mime: secondary };
      } catch (e2) {
        console.warn(`MediaRecorder also failed with ${secondary}`, e2);
        // → ffmpeg.wasm へ
      }
    }
  } else {
    console.log('MediaRecorder skipped: captureStream() not supported or MediaRecorder missing.');
  }

  // 2) ffmpeg.wasm（まずprimary、失敗時secondary）
  try {
    const blob = await encodeWithFFmpeg(frames, fps, primary);
    console.log(`Encoded with ffmpeg.wasm as ${primary}`);
    return { blob, filename: `output.${extOf(primary)}`, mime: primary };
  } catch (e3) {
    console.warn(`ffmpeg.wasm failed with ${primary}`, e3);
    const blob = await encodeWithFFmpeg(frames, fps, secondary);
    console.log(`Encoded with ffmpeg.wasm as ${secondary}`);
    return { blob, filename: `output.${extOf(secondary)}`, mime: secondary };
  }
}

/* ---------------- MediaRecorder 実装 ---------------- */

async function encodeWithMediaRecorder(
  frames: CanvasImageSource[],
  fps: number,
  mime: Mime,
): Promise<Blob> {
  const { width, height } = detectSize(frames[0]);

  // オンメモリCanvas（OffscreenはcaptureStream未対応環境が多いので通常Canvas）
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  // captureStream は存在チェック済み
  const stream: MediaStream = (canvas as any).captureStream
    ? (canvas as any).captureStream(fps)
    : (canvas as any).captureStream();

  // 端末ごとに厳しすぎると失敗するので4Mbps程度
  const options: MediaRecorderOptions = { mimeType: mime, videoBitsPerSecond: 4_000_000 };
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch {
    // mimeTypeが受け付けられない場合は指定なしで再トライ
    recorder = new MediaRecorder(stream);
  }

  const chunks: BlobPart[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (ev) => ev.data && chunks.push(ev.data);
    recorder.onerror = (ev) => reject((ev as any).error ?? new Error('MediaRecorder error'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  recorder.start();

  const frameInterval = Math.max(1, Math.round(1000 / fps));
  for (let i = 0; i < frames.length; i++) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frames[i], 0, 0, width, height);
    // MediaRecorderはリアルタイム進行が期待値。setTimeoutで最低限間隔を担保
    // eslint-disable-next-line no-await-in-loop
    await sleep(frameInterval);
  }

  recorder.stop();
  return done;
}

/* ---------------- ffmpeg.wasm 実装 ---------------- */

async function encodeWithFFmpeg(
  frames: CanvasImageSource[],
  fps: number,
  mime: Mime,
): Promise<Blob> {
  const { width, height } = detectSize(frames[0]);

  // 連番PNGを仮想FSへ書き出し
  const ffmpeg = createFFmpeg({
    log: false,
    // プロジェクトの配置に合わせて調整（public/ffmpeg/… に置く想定）
    corePath: '/ffmpeg/ffmpeg-core.js',
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  for (let i = 0; i < frames.length; i++) {
    const png = canvasSourceToPng(frames[i], width, height);
    await ffmpeg.FS('writeFile', `frame_${String(i).padStart(5, '0')}.png`, png);
  }

  const out = mime === 'video/webm' ? 'out.webm' : 'out.mp4';
  const args =
    mime === 'video/webm'
      ? [
          '-framerate', String(fps),
          '-i', 'frame_%05d.png',
          '-c:v', 'libvpx-vp9',
          '-b:v', '2M',
          '-pix_fmt', 'yuv420p',
          out,
        ]
      : [
          '-framerate', String(fps),
          '-i', 'frame_%05d.png',
          '-c:v', 'libx264',
          '-b:v', '2M',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          out,
        ];

  await ffmpeg.run(...args);
  const data = ffmpeg.FS('readFile', out);

  // 後片付け（失敗しても無視）
  try {
    for (let i = 0; i < frames.length; i++) {
      ffmpeg.FS('unlink', `frame_${String(i).padStart(5, '0')}.png`);
    }
    ffmpeg.FS('unlink', out);
  } catch { /* noop */ }

  return new Blob([data.buffer], { type: mime });
}

/* ---------------- 画像→PNG バイト列 ---------------- */

function canvasSourceToPng(
  src: CanvasImageSource,
  width: number,
  height: number,
): Uint8Array {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(src, 0, 0, width, height);
  const dataUrl = c.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function detectSize(src: CanvasImageSource): { width: number; height: number } {
  const any = src as any;
  return {
    width: any.videoWidth ?? any.naturalWidth ?? any.width ?? 720,
    height: any.videoHeight ?? any.naturalHeight ?? any.height ?? 1280,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
