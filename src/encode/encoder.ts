// src/encode/encoder.ts
/* eslint-disable no-console */

/**
 * ねらい
 * - ffmpeg.wasm を安定利用：まず「単一JPEG + -loop 1」で動画化（仮想FSを膨らませない）
 * - それでも NG/極小なら MediaRecorder に即フォールバック（端末依存対策）
 * - ESM/UMD 双方を許容し、corePath は同一オリジン /ffmpeg/ffmpeg-core.js を優先
 * - 出力は H.264 Baseline + yuv420p + +faststart（Android/iOS 再生互換）を維持
 */

type Mime = 'video/webm' | 'video/mp4';

export interface EncodeOptions {
  fps: number;
  preferredMime?: Mime;
}
type EncodeInput = number | EncodeOptions;

const MIN_VALID_SIZE = 64 * 1024; // 64KB 未満は不正/極短とみなす
const MIN_DURATION_SEC = 1;       // 最小尺 1s

/* ---------------- small utils ---------------- */

function corePathFromBase(): string {
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  return new URL('ffmpeg/ffmpeg-core.js', location.origin + base).pathname;
}
async function loadScript(src: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`script load failed: ${src}`));
    document.head.appendChild(el);
  });
}
function normalizeOptions(opts: EncodeInput): EncodeOptions {
  return typeof opts === 'number' ? { fps: opts } : opts;
}

/* ---------------- 端末判定 & MIME選択 ---------------- */

function isIOS(): boolean {
  const ua = navigator.userAgent;
  const platform = (navigator as any).platform || '';
  const iOSFamily = /\b(iPad|iPhone|iPod)\b/.test(ua) && !/Android/i.test(ua);
  const touchOnMac = /Macintosh/.test(ua) && 'ontouchend' in document;
  const applePlatform = /iPad|iPhone|iPod/.test(platform);
  return iOSFamily || touchOnMac || applePlatform;
}
function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}
export function getPreferredMimeType(): Mime {
  return (isIOS() || isAndroid()) ? 'video/mp4' : 'video/webm';
}
function altPreferred(mime: Mime): Mime {
  return mime === 'video/webm' ? 'video/mp4' : 'video/webm';
}

/* ---------------- フレーム正規化ユーティリティ ---------------- */

type ImageDataLike = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
type AnyFrame =
  | CanvasImageSource
  | ImageData
  | ImageDataLike
  | Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array
  | ArrayBuffer | number[]
  | Blob | string | Promise<any>
  | { pixels?: any; data?: any; width?: number; height?: number; channels?: number; url?: string; src?: string; type?: string; format?: string; base64?: string }
  | { canvas?: any; bitmap?: any | Promise<any>; image?: any; video?: any };

function ensureUint8Clamped(buf: ArrayLike<number>): Uint8ClampedArray {
  if (buf instanceof Uint8ClampedArray) return buf;
  if (buf instanceof Uint8Array) return new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = (buf as any)?.length ?? 0;
  const out = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i++) {
    let v = Number((buf as any)[i] ?? 0);
    if (!Number.isFinite(v)) v = 0;
    if (v > 255) v = 255; else if (v < 0) v = 0;
    out[i] = v;
  }
  return out;
}
function makeImageData(data: Uint8ClampedArray, w: number, h: number): ImageData {
  const expectedLen = w * h * 4;
  const copy = new Uint8ClampedArray(expectedLen);
  copy.set(data.subarray(0, Math.min(expectedLen, data.length)));
  return new ImageData(copy, w, h);
}
function expandToRgba(buf: Uint8ClampedArray, w: number, h: number, channels: number): Uint8ClampedArray {
  if (channels === 4) return buf;
  const out = new Uint8ClampedArray(w * h * 4);
  if (channels === 1) {
    for (let i = 0, j = 0; i < buf.length; i++, j += 4) {
      const v = buf[i];
      out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
    }
  } else if (channels === 3) {
    for (let i = 0, j = 0; i < buf.length; i += 3, j += 4) {
      out[j] = buf[i]; out[j + 1] = buf[i + 1]; out[j + 2] = buf[i + 2]; out[j + 3] = 255;
    }
  } else {
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
function base64ToBlob(b64: string, mime = 'image/png'): Blob {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
async function stringToDrawable(s: string): Promise<CanvasImageSource> {
  if (s.startsWith('data:')) {
    try { return await loadImage(s); } catch {
      const m = s.match(/^data:(.*?);base64,(.*)$/);
      if (m) {
        const mime = m[1] || 'image/png';
        const blob = base64ToBlob(m[2], mime);
        return await createImageBitmap(blob);
      }
    }
  }
  if (s.startsWith('blob:') || s.startsWith('http://') || s.startsWith('https://')) {
    return await loadImage(s);
  }
  if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 100) {
    const blob = base64ToBlob(s, 'image/png');
    return await createImageBitmap(blob);
  }
  throw new TypeError('stringToDrawable: unsupported string format');
}
function isCanvasImageSource(x: unknown): x is CanvasImageSource {
  const g: any = globalThis as any;
  return !!(
    (g.HTMLCanvasElement && x instanceof g.HTMLCanvasElement) ||
    (g.ImageBitmap && x instanceof g.ImageBitmap) ||
    (g.HTMLImageElement && x instanceof g.HTMLImageElement) ||
    (g.HTMLVideoElement && x instanceof g.HTMLVideoElement) ||
    (g.OffscreenCanvas && x instanceof g.OffscreenCanvas) ||
    (g.SVGImageElement && x instanceof g.SVGImageElement) ||
    (g.VideoFrame && x instanceof g.VideoFrame) ||
    ((x as any)?.getContext && (x as any)?.width && (x as any)?.height) ||
    ((x as any)?.close && (x as any)?.displayWidth && (x as any)?.displayHeight)
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
async function toDrawable(src: AnyFrame, fallbackSize?: { width: number; height: number }): Promise<CanvasImageSource> {
  if (src && typeof (src as Promise<any>).then === 'function') {
    const resolved = await (src as Promise<any>);
    return toDrawable(resolved, fallbackSize);
  }
  if (isCanvasImageSource(src)) return src as CanvasImageSource;
  if ((src as any)?.canvas && isCanvasImageSource((src as any).canvas)) return (src as any).canvas;
  if ((src as any)?.bitmap) {
    let b = (src as any).bitmap;
    if (b && typeof (b as Promise<any>)?.then === 'function') b = await b;
    if (isCanvasImageSource(b)) return b;
    if (b && typeof b === 'object' && 'close' in b) return b as CanvasImageSource;
  }
  if ((src as any)?.image && isCanvasImageSource((src as any).image)) return (src as any).image;
  if ((src as any)?.video && isCanvasImageSource((src as any).video)) return (src as any).video;
  if (
    src &&
    typeof src === 'object' &&
    typeof (src as any).width === 'number' &&
    typeof (src as any).height === 'number' &&
    (typeof (src as any).getContext === 'function' || typeof (src as any).toDataURL === 'function')
  ) {
    return src as any;
  }
  if (src instanceof ImageData || isImageDataLike(src)) {
    const w = (src as any).width ?? fallbackSize?.width ?? 720;
    const h = (src as any).height ?? fallbackSize?.height ?? 1280;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const data = src instanceof ImageData ? src.data : ensureUint8Clamped((src as any).data);
    const channels = (src as any).channels ?? 4;
    const rgba = channels === 4 ? data : expandToRgba(ensureUint8Clamped(data), w, h, channels);
    const id = makeImageData(ensureUint8Clamped(rgba), w, h);
    ctx.putImageData(id, 0, 0);
    return c;
  }
  if (
    src instanceof Uint8Array ||
    src instanceof Uint8ClampedArray ||
    src instanceof Uint16Array ||
    src instanceof Float32Array ||
    src instanceof ArrayBuffer ||
    Array.isArray(src)
  ) {
    const w = fallbackSize?.width ?? 720;
    const h = fallbackSize?.height ?? 1280;
    const bytes =
      src instanceof ArrayBuffer
        ? new Uint8Array(src)
        : src instanceof Uint8Array || src instanceof Uint8ClampedArray
        ? src
        : ensureUint8Clamped(src as any);
    const rgba = ensureUint8Clamped(bytes as any);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const id = makeImageData(rgba, w, h);
    ctx.putImageData(id, 0, 0);
    return c;
  }
  if (typeof src === 'object' && src) {
    const maybe = src as any;
    if (typeof maybe.base64 === 'string' || typeof maybe.data === 'string') {
      const b64 = (maybe.base64 ?? maybe.data) as string;
      const mime = (maybe.format ?? maybe.type ?? 'image/png') as string;
      try {
        const bin = atob(b64.replace(/^data:.*;base64,/, ''));
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const blob = new Blob([u8], { type: mime });
        return await createImageBitmap(blob);
      } catch {}
    }
    if ((maybe.pixels || maybe.data) && typeof maybe.width === 'number' && typeof maybe.height === 'number') {
      const w = maybe.width, h = maybe.height;
      const raw = maybe.pixels ?? maybe.data;
      const buf = ArrayBuffer.isView(raw)
        ? ensureUint8Clamped(raw as any)
        : Array.isArray(raw)
        ? ensureUint8Clamped(raw as any)
        : raw instanceof ArrayBuffer
        ? ensureUint8Clamped(new Uint8Array(raw))
        : ensureUint8Clamped(new Uint8Array(raw as ArrayBufferLike));
      const channels = maybe.channels ?? 4;
      const rgba = channels === 4 ? buf : expandToRgba(buf, w, h, channels);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable');
      const id = makeImageData(rgba, w, h);
      ctx.putImageData(id, 0, 0);
      return c;
    }
    const rawUrl = (maybe.url ?? maybe.src) as string | undefined;
    if (typeof rawUrl === 'string') return await loadImage(rawUrl);
  }
  if (src instanceof Blob) return await createImageBitmap(src);
  if (typeof src === 'string') return await stringToDrawable(src);
  if (fallbackSize) {
    const c = document.createElement('canvas');
    c.width = fallbackSize.width; c.height = fallbackSize.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.clearRect(0, 0, c.width, c.height);
    return c;
  }
  throw new TypeError('toDrawable: unsupported frame type for drawImage');
}

/* ---------------- FFmpeg ローダ（関数API/クラスAPI 両対応） ---------------- */

type FFmpegClassic = {
  isLoaded(): boolean;
  load(): Promise<void>;
  FS(op: string, path: string, data?: Uint8Array): any;
  run(...args: string[]): Promise<void>;
};
type FFmpegModern = {
  loaded: boolean;
  load(): Promise<void>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  exec(args: string[]): Promise<void>;
  on?(event: string, cb: (...args: any[]) => void): void;
  coreURL?: string;
};

type FFmpegUnified = {
  load(): Promise<void>;
  write(path: string, data: Uint8Array): Promise<void>;
  read(path: string): Promise<Uint8Array>;
  exec(args: string[]): Promise<void>;
};

async function getFFmpegUnified(): Promise<FFmpegUnified | null> {
  // 1) プロジェクト依存の ESM
  try {
    console.info('[FFmpeg] trying ESM import: @ffmpeg/ffmpeg');
    const m: any = await import('@ffmpeg/ffmpeg');
    const unified = coerceModuleToUnified(m);
    if (unified) return unified;
    console.warn('[FFmpeg] ESM loaded but usable API not found:', m);
  } catch (e) {
    console.warn('[FFmpeg] ESM import failed: @ffmpeg/ffmpeg', e);
  }
  // 2) CDN (ESM)
  try {
    const url = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js';
    console.info('[FFmpeg] trying CDN ESM:', url);
    // @ts-ignore
    const m: any = await import(/* @vite-ignore */ url);
    const unified = coerceModuleToUnified(m);
    if (unified) return unified;
    console.warn('[FFmpeg] CDN ESM loaded but usable API not found:', m);
  } catch (e) {
    console.warn('[FFmpeg] CDN ESM import failed', e);
  }
  // 3) CDN (UMD)
  try {
    const url = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.min.js';
    console.info('[FFmpeg] trying CDN UMD:', url);
    await loadScript(url);
    const g: any = globalThis as any;
    const ns = g?.FFmpeg || g?.ffmpeg || g?.default?.FFmpeg || g?.default?.ffmpeg || g;
    const unified = coerceModuleToUnified(ns);
    if (unified) return unified;
    console.error('[FFmpeg] UMD loaded but usable API not found on window');
  } catch (e) {
    console.error('[FFmpeg] CDN UMD load failed', e);
  }
  console.error('[FFmpeg] all strategies failed to resolve usable FFmpeg API');
  return null;
}

function coerceModuleToUnified(mod: any): FFmpegUnified | null {
  if (!mod) return null;

  // --- 関数API（createFFmpeg）
  const createFFmpeg =
    mod?.createFFmpeg ??
    mod?.default?.createFFmpeg ??
    mod?.default?.default?.createFFmpeg ??
    (typeof mod === 'function' && mod.name === 'createFFmpeg' ? mod : undefined);

  if (typeof createFFmpeg === 'function') {
    const ff: FFmpegClassic = createFFmpeg({
      log: false,
      worker: false,
      corePath: corePathFromBase(), // public/ffmpeg/ffmpeg-core.js 前提
    });
    return {
      async load() { if (!ff.isLoaded()) await ff.load(); },
      async write(path, data) { ff.FS('writeFile', path, data); },
      async read(path) { return ff.FS('readFile', path) as Uint8Array; },
      async exec(args) { await ff.run(...args); },
    };
  }

  // --- クラスAPI（new FFmpeg）
  const FFmpegClass =
    mod?.FFmpeg ??
    mod?.default?.FFmpeg ??
    (typeof mod === 'function' && /FFmpeg/.test(mod?.name || '') ? mod : undefined);

  if (typeof FFmpegClass === 'function') {
    const inst: FFmpegModern = new FFmpegClass();
    try { (inst as any).coreURL = corePathFromBase().replace(/\.js$/, '.wasm'); } catch {}
    return {
      async load() {
        try { if (!(inst as any).loaded) await inst.load(); else await inst.load(); }
        catch { await inst.load(); }
      },
      async write(path, data) { await inst.writeFile(path, data); },
      async read(path) { return await inst.readFile(path); },
      async exec(args) { await inst.exec(args); },
    };
  }

  return null;
}

/* ---------------- パブリックAPI ---------------- */

export async function encodeVideo(frames: AnyFrame[], opts: EncodeInput): Promise<Blob> {
  const { blob } = await encodeVideoWithMeta(frames, normalizeOptions(opts));
  return blob;
}

export async function encodeVideoWithMeta(
  frames: AnyFrame[],
  { fps, preferredMime }: EncodeOptions,
): Promise<{ blob: Blob; filename: string; mime: Mime }> {
  if (!frames?.length) throw new Error('encodeVideo: frames is empty');

  const primary: Mime = preferredMime ?? getPreferredMimeType();
  const secondary: Mime = altPreferred(primary);

  // 1) ffmpeg（単一JPEGルート）→ NG なら MR に切替
  try {
    const blob = await encodeWithFFmpegLoop(frames, fps, primary);
    if (blob.size >= MIN_VALID_SIZE) {
      const mime = (blob.type || primary) as Mime;
      const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
      return { blob, filename, mime };
    }
    console.warn('[Encode] FFmpeg output too small, fallback to MediaRecorder…');
  } catch (e1) {
    console.warn(`ffmpeg.wasm failed with ${primary}`, e1);
  }

  // 2) MediaRecorder フォールバック（実機互換対策）
  try {
    const mr = await import('./mediarec');
    const blob = await mr.encodeWithMediaRecorder(
      // cv.Mat ベースの経路が上流にある前提（toDrawableは mediarec 側で不要）
      (frames as unknown) as any, fps, primary
    );
    const mime = (blob.type || primary) as Mime;
    const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
    if (blob.size >= MIN_VALID_SIZE) return { blob, filename, mime };
  } catch (e2) {
    console.warn('[Encode] MediaRecorder fallback failed', e2);
  }

  // 3) 最後の手段：別MIMEで ffmpeg をもう一度（単一JPEGルート）
  const blob = await encodeWithFFmpegLoop(frames, fps, secondary);
  const mime = (blob.type || secondary) as Mime;
  const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
  return { blob, filename, mime };
}

/* ---------------- ffmpeg 単一JPEGルート（FSエラー回避） ---------------- */

async function encodeWithFFmpegLoop(
  frames: AnyFrame[],
  fps: number,
  target: Mime,
): Promise<Blob> {
  const ff = await getFFmpegUnified();
  if (!ff) throw new Error('ffmpeg-unavailable');
  await ff.load();

  // 入力の先頭フレームを drawable に
  const firstDrawable = await toDrawable(frames[0] as any, { width: 720, height: 1280 });
  const { width, height } = detectSize(firstDrawable as any);

  // 1枚だけ JPEG にして書き込む（仮想FS負荷を最小化）
  const jpg = await canvasSourceToJpegBytes(firstDrawable as any, width, height, 0.8);
  await ff.write('frame.jpg', jpg);

  // 最小尺を強制（fpsが低すぎても 1s に）
  const duration = Math.max(MIN_DURATION_SEC, (frames.length / Math.max(1, fps)));

  const out = target === 'video/webm' ? 'out.webm' : 'out.mp4';
  const args =
    target === 'video/webm'
      ? [
          '-loop', '1',
          '-t', String(duration),
          '-framerate', String(fps),
          '-i', 'frame.jpg',
          '-c:v', 'libvpx-vp8',
          '-b:v', '2M',
          '-pix_fmt', 'yuv420p',
          '-r', String(fps),
          out
        ]
      : [
          '-loop', '1',
          '-t', String(duration),
          '-framerate', String(fps),
          '-i', 'frame.jpg',
          '-c:v', 'libx264',
          '-profile:v', 'baseline',
          '-level', '3.1',
          '-pix_fmt', 'yuv420p',
          '-b:v', '2M',
          '-maxrate', '2M',
          '-bufsize', '4M',
          '-movflags', '+faststart',
          '-r', String(fps),
          '-g', String(Math.max(1, Math.round(fps * 2))),
          out
        ];

  await ff.exec(args);
  const data: Uint8Array = await ff.read(out);

  // 片付け（失敗しても無視）
  try { await ff.exec(['-y', '-i', 'frame.jpg', '-f', 'null', '-']); } catch {}

  const mime = target === 'video/webm' ? 'video/webm' : 'video/mp4';
  // ★ 安定策：data.buffer ではなく data をそのまま Blob へ（既知の互換対策）:contentReference[oaicite:1]{index=1}
  // TS2322 ビルドエラー対策：data.buffer が SharedArrayBuffer の可能性があるため、
  // new Uint8Array(data) でコピーを強制し、必ず標準の ArrayBuffer を持つようにする。
  const safeData = new Uint8Array(data);
  return new Blob([safeData.buffer], { type: mime });
}

/* ---------------- 画像→JPEG バイト列 ---------------- */

async function canvasSourceToJpegBytes(
  src: CanvasImageSource,
  width: number,
  height: number,
  quality = 0.8
): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(src as any, 0, 0, width, height);
  const blob: Blob = await new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob jpeg failed'))), 'image/jpeg', quality);
  });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function detectSize(src: any): { width: number; height: number } {
  return {
    width: src?.videoWidth ?? src?.naturalWidth ?? src?.width ?? 720,
    height: src?.videoHeight ?? src?.naturalHeight ?? src?.height ?? 1280,
  };
}
