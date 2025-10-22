// src/encode/encoder.ts
/* eslint-disable no-console */

/* ---------------- ffmpeg ローダ（無ければ null を返す） ---------------- */
async function getCreateFFmpeg(): Promise<null | ((opts: any) => any)> {
  try {
    const mod: any = await import('@ffmpeg/ffmpeg');
    const create = mod?.createFFmpeg ?? mod?.default?.createFFmpeg;
    return typeof create === 'function' ? create : null;
  } catch {
    return null; // 依存が解決できない環境では ffmpeg をスキップ
  }
}

type Mime = 'video/webm' | 'video/mp4';

export interface EncodeOptions {
  fps: number;
  preferredMime?: Mime; // 明示指定があれば優先
}

// 旧API互換：fps:number でも EncodeOptions でも受け付ける
type EncodeInput = number | EncodeOptions;

/* ---------------- 判定ユーティリティ ---------------- */

function isIOS(): boolean {
  const ua = navigator.userAgent;
  const platform = (navigator as any).platform || '';
  const iOSFamily = /\b(iPad|iPhone|iPod)\b/.test(ua) && !/Android/i.test(ua);
  const touchOnMac = /Macintosh/.test(ua) && 'ontouchend' in document;
  const applePlatform = /iPad|iPhone|iPod/.test(platform);
  return iOSFamily || touchOnMac || applePlatform;
}

function canCaptureStream(): boolean {
  const htmlCanvasProto = (HTMLCanvasElement as any)?.prototype;
  const offscreenProto = (globalThis as any).OffscreenCanvas?.prototype;
  return (
    typeof htmlCanvasProto?.captureStream === 'function' ||
    typeof offscreenProto?.captureStream === 'function'
  );
}

export function getPreferredMimeType(): Mime {
  return isIOS() ? 'video/mp4' : 'video/webm';
}

function alternativeOf(mime: Mime): Mime {
  return mime === 'video/webm' ? 'video/mp4' : 'video/webm';
}

function extOf(mime: Mime): 'webm' | 'mp4' {
  return mime === 'video/webm' ? 'webm' : 'mp4';
}

function normalizeOptions(opts: EncodeInput): EncodeOptions {
  return typeof opts === 'number' ? { fps: opts } : opts;
}

/* ---------------- フレーム正規化（drawImage可能に変換） ---------------- */

// RGBA配列を含む構造
type ImageDataLike = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

// 多様な入力に対応
type AnyFrame =
  | CanvasImageSource
  | ImageData
  | ImageDataLike
  | Uint8Array
  | ArrayBuffer
  | Blob
  | string
  | { pixels: Uint8Array | Uint8ClampedArray; width: number; height: number; channels?: number }
  | { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels?: number }
  | { url?: string; src?: string }
  | { canvas?: any; bitmap?: any; image?: any; video?: any }; // ラッパー系

function isCanvasImageSource(x: unknown): x is CanvasImageSource {
  const g: any = globalThis as any;
  // duck-typing: OffscreenCanvas/VideoFrame等、別Realmも拾う
  return !!(
    (g.HTMLCanvasElement && x instanceof g.HTMLCanvasElement) ||
    (g.ImageBitmap && x instanceof g.ImageBitmap) ||
    (g.HTMLImageElement && x instanceof g.HTMLImageElement) ||
    (g.HTMLVideoElement && x instanceof g.HTMLVideoElement) ||
    (g.OffscreenCanvas && x instanceof g.OffscreenCanvas) ||
    (g.SVGImageElement && x instanceof g.SVGImageElement) ||
    (g.VideoFrame && x instanceof g.VideoFrame) ||
    // 別Realm対策：主要プロパティで推定
    ((x as any)?.getContext && (x as any)?.width && (x as any)?.height) || // Canvas系
    ((x as any)?.close && (x as any)?.displayWidth && (x as any)?.displayHeight) // VideoFrameライク
  );
}

function isImageDataLike(x: any): x is ImageDataLike {
  return (
    x &&
    (x.data instanceof Uint8ClampedArray || x.data instanceof Uint8Array) &&
    typeof x.width === 'number' &&
    typeof x.height === 'number'
  );
}

function ensureUint8Clamped(buf: Uint8Array | Uint8ClampedArray): Uint8ClampedArray {
  return buf instanceof Uint8ClampedArray ? buf : new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
}

function expandToRgba(buf: Uint8ClampedArray, w: number, h: number, channels: number): Uint8ClampedArray {
  // channels=1(グレースケール)や3(RGB)をRGBAへ拡張
  if (channels === 4) return buf;
  const out = new Uint8ClampedArray(w * h * 4);
  if (channels === 1) {
    for (let i = 0, j = 0; i < buf.length; i += 1, j += 4) {
      const v = buf[i];
      out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
    }
  } else if (channels === 3) {
    for (let i = 0, j = 0; i < buf.length; i += 3, j += 4) {
      out[j] = buf[i]; out[j + 1] = buf[i + 1]; out[j + 2] = buf[i + 2]; out[j + 3] = 255;
    }
  } else {
    // 未知チャンネル数はα=255で切り上げ（長さが合わない場合は0埋め）
    for (let i = 0, j = 0; j < out.length; i += channels, j += 4) {
      out[j] = buf[i] ?? 0;
      out[j + 1] = buf[i + 1] ?? 0;
      out[j + 2] = buf[i + 2] ?? 0;
      out[j + 3] = 255;
    }
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function toDrawable(
  src: AnyFrame,
  fallbackSize?: { width: number; height: number },
): Promise<CanvasImageSource> {
  // そのまま使える型
  if (isCanvasImageSource(src)) return src as CanvasImageSource;

  // ラッパー解体
  if ((src as any)?.canvas && isCanvasImageSource((src as any).canvas)) return (src as any).canvas;
  if ((src as any)?.bitmap) {
    const b = (src as any).bitmap;
    if (isCanvasImageSource(b)) return b;
    // OffscreenCanvas#transferToImageBitmapの戻りなど
    if (b && typeof b === 'object' && 'close' in b) return b as CanvasImageSource;
  }
  if ((src as any)?.image && isCanvasImageSource((src as any).image)) return (src as any).image;
  if ((src as any)?.video && isCanvasImageSource((src as any).video)) return (src as any).video;

  // ImageData / ImageDataLike
  if (src instanceof ImageData || isImageDataLike(src)) {
    const w = (src as any).width ?? fallbackSize?.width ?? 720;
    const h = (src as any).height ?? fallbackSize?.height ?? 1280;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const data = src instanceof ImageData ? src.data : ensureUint8Clamped((src as any).data);
    const channels = (src as any).channels ?? 4;
    const rgba = channels === 4 ? data : expandToRgba(data, w, h, channels);
    const id = new ImageData(rgba, w, h);
    ctx.putImageData(id, 0, 0);
    return c;
  }

  // Uint8Array / ArrayBuffer（RGBA想定）
  if (src instanceof Uint8Array || src instanceof ArrayBuffer) {
    const w = fallbackSize?.width ?? 720;
    const h = fallbackSize?.height ?? 1280;
    const bytes = src instanceof Uint8Array ? src : new Uint8Array(src);
    const rgba = ensureUint8Clamped(bytes);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const id = new ImageData(rgba, w, h);
    ctx.putImageData(id, 0, 0);
    return c;
  }

  // {pixels|data,width,height}
  if (typeof src === 'object' && src) {
    const maybe = src as any;
    if ((maybe.pixels || maybe.data) && typeof maybe.width === 'number' && typeof maybe.height === 'number') {
      const w = maybe.width, h = maybe.height;
      const buf = ensureUint8Clamped(maybe.pixels ?? maybe.data);
      const channels = maybe.channels ?? 4;
      const rgba = channels === 4 ? buf : expandToRgba(buf, w, h, channels);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable');
      const id = new ImageData(rgba, w, h);
      ctx.putImageData(id, 0, 0);
      return c;
    }
    // {url|src} 文字列を持つ場合（http/https/blob/data:image）
    const rawUrl = (maybe.url ?? maybe.src) as string | undefined;
    if (typeof rawUrl === 'string') {
      const img = await loadImage(rawUrl);
      return img;
    }
  }

  // Blob
  if (src instanceof Blob) {
    try {
      const bmp = await createImageBitmap(src);
      return bmp;
    } catch {
      // 画像Blobでなければこの経路は不可
    }
  }

  // 文字列（dataURL / http(s) / blob:）
  if (typeof src === 'string') {
    const s = src as string;
    if (s.startsWith('data:image:') || s.startsWith('data:image/')) {
      return await loadImage(s);
    }
    if (s.startsWith('blob:') || s.startsWith('http://') || s.startsWith('https://')) {
      return await loadImage(s); // CORS注意だが同一オリジン/Blob想定
    }
  }

  throw new TypeError('toDrawable: unsupported frame type for drawImage');
}

async function normalizeFrames(frames: AnyFrame[]): Promise<CanvasImageSource[]> {
  if (!frames?.length) throw new Error('encodeVideo: frames is empty');
  const size = detectSize(frames[0] as any);
  const out: CanvasImageSource[] = [];
  for (const f of frames) {
    // eslint-disable-next-line no-await-in-loop
    const d = await toDrawable(f, size);
    out.push(d);
  }
  return out;
}

/* ---------------- パブリックAPI ---------------- */

/** 旧API互換：Blob を返す（呼び出し側は `encodeVideo(frames, 30)` のままでOK） */
export async function encodeVideo(
  frames: AnyFrame[],
  opts: EncodeInput,
): Promise<Blob> {
  const { blob } = await encodeVideoWithMeta(frames, normalizeOptions(opts));
  return blob;
}

/** 新API：メタ付き */
export async function encodeVideoWithMeta(
  frames: AnyFrame[],
  { fps, preferredMime }: EncodeOptions,
): Promise<{ blob: Blob; filename: string; mime: Mime }> {
  const primary: Mime = preferredMime ?? getPreferredMimeType();
  const secondary: Mime = alternativeOf(primary);

  // まずフレームを drawImage 可能な型に正規化（MediaRecorder/ffmpeg 共用）
  const drawable = await normalizeFrames(frames);

  // 1) MediaRecorder（captureStream必須）
  if (typeof (globalThis as any).MediaRecorder === 'function' && canCaptureStream()) {
    try {
      const blob = await encodeWithMediaRecorder(drawable, fps, primary);
      console.log(`Encoded with MediaRecorder as ${primary}`);
      return { blob, filename: `output.${extOf(primary)}`, mime: primary };
    } catch (e1) {
      console.warn(`MediaRecorder failed with ${primary}`, e1);
      try {
        const blob = await encodeWithMediaRecorder(drawable, fps, secondary);
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

  // 2) ffmpeg.wasm（依存が無ければスキップ）
  try {
    const blob = await encodeWithFFmpeg(drawable, fps, primary);
    console.log(`Encoded with ffmpeg.wasm as ${primary}`);
    return { blob, filename: `output.${extOf(primary)}`, mime: primary };
  } catch (e3) {
    console.warn(`ffmpeg.wasm failed with ${primary}`, e3);
    const blob = await encodeWithFFmpeg(drawable, fps, secondary);
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
  const { width, height } = detectSize(frames[0] as any);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  const stream: MediaStream = (canvas as any).captureStream
    ? (canvas as any).captureStream(fps)
    : (canvas as any).captureStream();

  const options: MediaRecorderOptions = { mimeType: mime, videoBitsPerSecond: 4_000_000 };
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch {
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
    try {
      ctx.drawImage(frames[i] as any, 0, 0, width, height);
    } catch {
      // 念のための二重防御（ここに来ることは通常ない）
      // eslint-disable-next-line no-await-in-loop
      const bmp = await toDrawable(frames[i] as any, { width, height });
      ctx.drawImage(bmp as any, 0, 0, width, height);
    }
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
  const createFFmpeg = await getCreateFFmpeg();
  if (!createFFmpeg) {
    throw new Error('ffmpeg-unavailable'); // 依存が無ければ上位で別Mime/手段へ
  }

  const ffmpeg = createFFmpeg({
    log: false,
    corePath: '/ffmpeg/ffmpeg-core.js', // public/ffmpeg に配置している想定
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const { width, height } = detectSize(frames[0] as any);

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
  ctx.drawImage(src as any, 0, 0, width, height);
  const dataUrl = c.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function detectSize(src: any): { width: number; height: number } {
  return {
    width: src?.videoWidth ?? src?.naturalWidth ?? src?.width ?? 720,
    height: src?.videoHeight ?? src?.naturalHeight ?? src?.height ?? 1280,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
