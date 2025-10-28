// src/encode/encoder.ts
/* eslint-disable no-console */

/**
 * ねらい
 * - 連番フレーム→ffmpeg.wasm で動画化（本筋）。小サイズ/失敗なら MIME 切替や MediaRecorderへフォールバック。
 * - フレーム正規化（drawImage 可能化）を徹底。
 * - 出力は H.264 Baseline + yuv420p + +faststart など再生互換を維持。
 * - 極小 Blob は失敗扱いでフォールバック（壊れ出力の早期排除）。
 */

export type Mime = 'video/webm' | 'video/mp4';

export interface EncodeOptions {
  fps: number;
  preferredMime?: Mime;
}
export type EncodeInput = number | EncodeOptions;

const MIN_VALID_SIZE = 64 * 1024; // 64KB未満は壊れ/極短とみなす（閾値は実運用で採用）
// 参考: 既存実装でもサイズ検証→フォールバックの方針（要旨）:contentReference[oaicite:3]{index=3}

/* ---------------- 判定ユーティリティ ---------------- */

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
function canCaptureStream(): boolean {
  const htmlCanvasProto = (HTMLCanvasElement as any)?.prototype;
  const offscreenProto = (globalThis as any).OffscreenCanvas?.prototype;
  return (
    typeof htmlCanvasProto?.captureStream === 'function' ||
    typeof offscreenProto?.captureStream === 'function'
  );
}
function canPlay(mime: Mime): boolean {
  const v = document.createElement('video');
  const candidates = [mime, `${mime};codecs=avc1.42E01E,mp4a.40.2`, `${mime};codecs=vp8,opus`];
  return candidates.some((m) => typeof v.canPlayType === 'function' && v.canPlayType(m as any) !== '');
}
/** 端末互換優先：iOS/Android は MP4、その他は WebM */
export function getPreferredMimeType(): Mime {
  return (isIOS() || isAndroid()) ? 'video/mp4' : 'video/webm'; // :contentReference[oaicite:4]{index=4}
}
function altPreferred(mime: Mime): Mime {
  return mime === 'video/webm' ? 'video/mp4' : 'video/webm';
}

/* ---------------- フレーム正規化（drawImage 可能に） ---------------- */

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
        const blob = base64ToBlob(b64.replace(/^data:.*;base64,/, ''), mime);
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
      c.width = w; c.height = h;
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

function detectSize(src: any): { width: number; height: number } {
  return {
    width: src?.videoWidth ?? src?.naturalWidth ?? src?.width ?? 720,
    height: src?.videoHeight ?? src?.naturalHeight ?? src?.height ?? 1280,
  };
}

function canvasSourceToPng(src: CanvasImageSource, width: number, height: number): Uint8Array {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(src as any, 0, 0, width, height);
  const dataUrl = c.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------- MediaRecorder 経路 ---------------- */

async function encodeWithMediaRecorder(
  frames: CanvasImageSource[],
  fps: number,
  mime: Mime,
): Promise<Blob> {
  const { width, height } = detectSize(frames[0]);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  const stream = (canvas as any).captureStream ? (canvas as any).captureStream(fps) : (canvas as any).captureStream?.();
  if (!stream) throw new Error('captureStream unavailable');

  const chunks: BlobPart[] = [];
  const recorder = new (globalThis as any).MediaRecorder(stream, { mimeType: mime });
  recorder.ondataavailable = (e: any) => e.data && chunks.push(e.data);
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (ev: any) => reject(ev.error || new Error('MediaRecorder error'));
  });

  recorder.start(Math.max(1000 / fps, 100));
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < frames.length; i++) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frames[i] as any, 0, 0, width, height);
    // eslint-disable-next-line no-await-in-loop
    await delay(1000 / fps);
  }

  recorder.stop();
  await stopped;

  return new Blob(chunks, { type: mime });
}

/* ---------------- ffmpeg.wasm 経路（連番フレーム→動画） ---------------- */

import { encodeWithFFmpeg as encodeWithFFmpegPng } from './ffmpeg'; // 連番PNG→動画
// 既存の「ffmpeg で first/secondary MIME を試す + サイズでフォールバック」の方針に沿う実装です。:contentReference[oaicite:5]{index=5}

async function encodeWithFFmpeg(
  frames: CanvasImageSource[],
  fps: number,
  mime: Mime,
): Promise<Blob> {
  // ffmpeg.ts は cv.Mat 前提だが、PNG 連番をそのままFSに書くのでここで RGBA→PNG 化して渡す必要なし。
  // ただし現在の ffmpeg.ts 実装は Mat→PNG を内部で行うため、本関数では Mat 互換オブジェクトを作る。
  // Mat 互換: { data: Uint8Array, rows: number, cols: number }
  const mats: any[] = [];
  for (let i = 0; i < frames.length; i++) {
    const s = frames[i];
    const size = detectSize(s);
    const pngBytes = canvasSourceToPng(s, size.width, size.height);
    // ffmpeg.ts は Mat→PNG を作るが、PNG バイトがあれば最短で使いたいところ。
    // 互換のため ImageData 経由の Mat 風オブジェクトを作成する。
    // （既存 ffmpeg.ts の matToPngBytes は Mat.data から PNG を生成するので、ここは RGBA ImageData を渡す）
    // → RGBA に戻す
    const c = document.createElement('canvas');
    c.width = size.width; c.height = size.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const img = new Image();
    img.src = 'data:image/png;base64,' + btoa(String.fromCharCode(...pngBytes));
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('png decode failed'));
    });
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const id = ctx.getImageData(0, 0, size.width, size.height);
    mats.push({ data: id.data, rows: size.height, cols: size.width, channels: () => 4 });
  }
  return await encodeWithFFmpegPng(mats, fps, mime);
}

/* ---------------- パブリックAPI ---------------- */

export async function encodeVideo(frames: AnyFrame[], opts: EncodeInput): Promise<Blob> {
  const { blob } = await encodeVideoWithMeta(frames, typeof opts === 'number' ? { fps: opts } : opts);
  return blob;
}

export async function encodeVideoWithMeta(
  frames: AnyFrame[],
  { fps, preferredMime }: EncodeOptions,
): Promise<{ blob: Blob; filename: string; mime: Mime }> {
  if (!frames?.length) throw new Error('encodeVideo: frames is empty');

  const primary: Mime = preferredMime ?? getPreferredMimeType();
  const secondary: Mime = altPreferred(primary);

  // まず frames を drawImage 可能な型に正規化（MediaRecorder/ffmpeg 共用）
  const drawables: CanvasImageSource[] = [];
  for (const f of frames) drawables.push(await toDrawable(f, { width: 720, height: 1280 }));
  // 既存コミットでの「広い入力型を受けて正規化」の方針を踏襲。:contentReference[oaicite:6]{index=6}

  // 1) MediaRecorder（再生可否＋サイズで判定）
  if (typeof (globalThis as any).MediaRecorder === 'function' && canCaptureStream()) {
    try {
      const blob1 = await encodeWithMediaRecorder(drawables, fps, primary);
      console.log('[Encode] MediaRecorder-1 type/size:', blob1.type, blob1.size);
      if (blob1.size >= MIN_VALID_SIZE && canPlay((blob1.type || primary) as Mime)) {
        const mime1 = (blob1.type || primary) as Mime;
        const name1 = mime1 === 'video/mp4' ? 'output.mp4' : 'output.webm';
        return { blob: blob1, filename: name1, mime: mime1 };
      }
      console.warn('[Encode] MR-1 not valid/playable. Trying secondary...');
      const blob2 = await encodeWithMediaRecorder(drawables, fps, secondary);
      console.log('[Encode] MediaRecorder-2 type/size:', blob2.type, blob2.size);
      if (blob2.size >= MIN_VALID_SIZE && canPlay((blob2.type || secondary) as Mime)) {
        const mime2 = (blob2.type || secondary) as Mime;
        const name2 = mime2 === 'video/mp4' ? 'output.mp4' : 'output.webm';
        return { blob: blob2, filename: name2, mime: mime2 };
      }
    } catch (e) {
      console.warn('MediaRecorder path failed', e);
    }
  } else {
    console.log('MediaRecorder skipped: captureStream() not supported or missing.');
  }

  // 2) ffmpeg.wasm（まず primary、ダメなら secondary）
  try {
    const b1 = await encodeWithFFmpeg(drawables, fps, primary);
    console.log('[Encode] ffmpeg-1 type/size:', b1.type, b1.size);
    if (b1.size >= MIN_VALID_SIZE) {
      const mime = (b1.type || primary) as Mime;
      const name = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
      return { blob: b1, filename: name, mime };
    }
    console.warn('[Encode] FFmpeg output too small, switching mime...');
    const b2 = await encodeWithFFmpeg(drawables, fps, secondary);
    const mime2 = (b2.type || secondary) as Mime;
    const name2 = mime2 === 'video/mp4' ? 'output.mp4' : 'output.webm';
    return { blob: b2, filename: name2, mime: mime2 };
  } catch (e1) {
    console.warn(`ffmpeg.wasm failed with ${primary}`, e1);
    const b2 = await encodeWithFFmpeg(drawables, fps, secondary);
    console.log('[Encode] ffmpeg-2 type/size:', b2.type, b2.size);
    if (b2.size < MIN_VALID_SIZE) throw new Error('Video encoding failed: empty or too small blob.');
    const mime = (b2.type || secondary) as Mime;
    const name = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
    return { blob: b2, filename: name, mime };
  }
}
