// src/encode/encoder.ts
/* eslint-disable no-console */

/* ---------------- ffmpeg ローダ（無ければ null を返す） ---------------- */
// createFFmpeg の呼び出しにデフォルト { worker:false, corePath:'/ffmpeg/ffmpeg-core.js' } を注入する
async function getCreateFFmpeg(): Promise<null | ((opts?: any) => any)> {
  try {
    const mod: any = await import('@ffmpeg/ffmpeg');
    const create = mod?.createFFmpeg ?? mod?.default?.createFFmpeg;
    if (typeof create !== 'function') return null;

    // ラッパ：呼び出し側が何も渡さなくても worker 無効 & 同一オリジンの corePath を利用
    return (opts: any = {}) => {
      const merged: any = { log: false, worker: false, ...opts };
      if (!('corePath' in merged)) merged.corePath = '/ffmpeg/ffmpeg-core.js';
      return create(merged);
    };
  } catch {
    return null; // 依存が解決できない環境では ffmpeg をスキップ
  }
}

type Mime = 'video/webm' | 'video/mp4';

export interface EncodeOptions {
  fps: number;
  preferredMime?: Mime;
}
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
function altPreferred(mime: Mime): Mime {
  return mime === 'video/webm' ? 'video/mp4' : 'video/webm';
}
function normalizeOptions(opts: EncodeInput): EncodeOptions {
  return typeof opts === 'number' ? { fps: opts } : opts;
}

/* ---------------- フレーム型サポート（drawImage可能に正規化） ---------------- */

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
function ensureUint8Clamped(buf: ArrayLike<number>): Uint8ClampedArray {
  if (buf instanceof Uint8ClampedArray) return buf;
  if (buf instanceof Uint8Array) return new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Uint8ClampedArray(buf.length);
  for (let i = 0; i < out.length; i++) {
    let v = (buf as any)[i] ?? 0;
    if (typeof v !== 'number') v = Number(v) || 0;
    if (v > 255) v = 255;
    else if (v < 0) v = 0;
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
    for (let i = 0, j = 0; i < buf.length; i += 1, j += 4) {
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
  if (src instanceof Uint8Array || src instanceof Uint8ClampedArray || src instanceof Uint16Array || src instanceof Float32Array || src instanceof ArrayBuffer || Array.isArray(src)) {
    const w = fallbackSize?.width ?? 720;
    const h = fallbackSize?.height ?? 1280;
    const bytes =
      src instanceof ArrayBuffer
        ? new Uint8Array(src)
        : src instanceof Float32Array || src instanceof Uint16Array || Array.isArray(src)
        ? ensureUint8Clamped(src as any)
        : (src as Uint8Array | Uint8ClampedArray);
    const rgba = ensureUint8Clamped(bytes);
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
    if (typeof rawUrl === 'string') {
      return await loadImage(rawUrl);
    }
  }
  if (src instanceof Blob) {
    return await createImageBitmap(src);
  }
  if (typeof src === 'string') {
    return await stringToDrawable(src);
  }
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

  // 1) MediaRecorder 優先（実出力の blob.type を採用）
  if (typeof (globalThis as any).MediaRecorder === 'function' && canCaptureStream()) {
    try {
      const blob1 = await encodeWithMediaRecorder(frames, fps, primary);
      const ok1 = await probePlayback(blob1);
      if (ok1) {
        const mime1 = (blob1.type || primary) as Mime;
        const filename1 = mime1 === 'video/mp4' ? 'output.mp4' : 'output.webm';
        return { blob: blob1, filename: filename1, mime: mime1 };
      }
      console.warn('Playback probe failed. Retrying with alternate MediaRecorder settings…');
      const blob2 = await encodeWithMediaRecorder(frames, fps, secondary);
      const ok2 = await probePlayback(blob2);
      if (ok2) {
        const mime2 = (blob2.type || secondary) as Mime;
        const filename2 = mime2 === 'video/mp4' ? 'output.mp4' : 'output.webm';
        return { blob: blob2, filename: filename2, mime: mime2 };
      }
    } catch (e1) {
      console.warn('MediaRecorder path failed', e1);
    }
  } else {
    console.log('MediaRecorder skipped: captureStream() not supported or MediaRecorder missing.');
  }

  // 2) ffmpeg.wasm（存在すれば）
  try {
    const blob = await encodeWithFFmpeg(frames, fps, primary);
    const mime = (blob.type || primary) as Mime;
    const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
    return { blob, filename, mime };
  } catch (e3) {
    console.warn(`ffmpeg.wasm failed with ${primary}`, e3);
    const blob = await encodeWithFFmpeg(frames, fps, secondary);
    const mime = (blob.type || secondary) as Mime;
    const filename = mime === 'video/mp4' ? 'output.mp4' : 'output.webm';
    return { blob, filename, mime };
  }
}

/* ---------------- MediaRecorder 実装 ---------------- */

function pickMediaRecorderMime(target: Mime): string | undefined {
  const candidates =
    target === 'video/webm'
      ? ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
      : ['video/mp4;codecs=avc1.42E01E', 'video/mp4'];
  for (const c of candidates) {
    if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

async function encodeWithMediaRecorder(
  frames: AnyFrame[],
  fps: number,
  target: Mime,
): Promise<Blob> {
  const firstDrawable = await toDrawable(frames[0] as any, { width: 720, height: 1280 });
  const { width, height } = detectSize(firstDrawable as any);

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  const stream: MediaStream = (canvas as any).captureStream
    ? (canvas as any).captureStream(fps)
    : (canvas as any).captureStream();

  const prefer = pickMediaRecorderMime(target);
  const options: MediaRecorderOptions = prefer
    ? { mimeType: prefer, videoBitsPerSecond: 4_000_000 }
    : { videoBitsPerSecond: 4_000_000 };

  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream, options); }
  catch { recorder = new MediaRecorder(stream); }

  const chunks: Blob[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
    recorder.onerror = (ev) => reject((ev as any).error ?? new Error('MediaRecorder error'));
    recorder.onstop = () => {
      const effectiveType =
        (chunks[0] && chunks[0].type) ||
        (recorder as any).mimeType ||
        (options as any).mimeType ||
        target;
      resolve(new Blob(chunks, { type: effectiveType }));
    };
  });

  recorder.start(100); // timeslice指定で ondataavailable を安定化
  const frameInterval = Math.max(4, Math.round(1000 / fps));

  const start = performance.now();
  for (let i = 0; i < frames.length; i++) {
    ctx.clearRect(0, 0, width, height);
    // eslint-disable-next-line no-await-in-loop
    const drawable = await toDrawable(frames[i] as any, { width, height });
    ctx.drawImage(drawable as any, 0, 0, width, height);
    // eslint-disable-next-line no-await-in-loop
    await sleep(frameInterval);
  }

  // 最低 500ms 程度の尺を確保
  const minMs = Math.max(500, (frames.length / fps) * 1000);
  const elapsed = performance.now() - start;
  if (elapsed < minMs) await sleep(minMs - elapsed);

  recorder.stop();
  return done;
}

/* ---- 再生プローブ ---- */
async function probePlayback(blob: Blob, timeoutMs = 4000): Promise<boolean> {
  try {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = url;
    const ok = await new Promise<boolean>((resolve) => {
      const to = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
      function cleanup() {
        clearTimeout(to);
        v.pause();
        URL.revokeObjectURL(url);
      }
      v.onloadedmetadata = () => {
        const good = isFinite(v.duration) && v.duration > 0 && v.readyState >= 1;
        cleanup(); resolve(good);
      };
      v.onerror = () => { cleanup(); resolve(false); };
    });
    return ok;
  } catch { return false; }
}

/* ---------------- ffmpeg.wasm 実装 ---------------- */

async function encodeWithFFmpeg(
  frames: AnyFrame[],
  fps: number,
  target: Mime,
): Promise<Blob> {
  const createFFmpeg = await getCreateFFmpeg();
  if (!createFFmpeg) throw new Error('ffmpeg-unavailable');

  // ラッパが既定で { worker:false, corePath:'/ffmpeg/ffmpeg-core.js' } を供給
  const ffmpeg = createFFmpeg();
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const firstDrawable = await toDrawable(frames[0] as any, { width: 720, height: 1280 });
  const { width, height } = detectSize(firstDrawable as any);

  for (let i = 0; i < frames.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const drawable = await toDrawable(frames[i] as any, { width, height });
    const png = canvasSourceToPng(drawable as any, width, height);
    await ffmpeg.FS('writeFile', `frame_${String(i).padStart(5, '0')}.png`, png);
  }

  const out = target === 'video/webm' ? 'out.webm' : 'out.mp4';
  const args =
    target === 'video/webm'
      ? ['-framerate', String(fps), '-i', 'frame_%05d.png', '-c:v', 'libvpx-vp8', '-b:v', '2M', '-pix_fmt', 'yuv420p', out]
      : ['-framerate', String(fps), '-i', 'frame_%05d.png', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-b:v', '2M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out];

  await ffmpeg.run(...args);
  const data = ffmpeg.FS('readFile', out);

  try {
    for (let i = 0; i < frames.length; i++) ffmpeg.FS('unlink', `frame_${String(i).padStart(5, '0')}.png`);
    ffmpeg.FS('unlink', out);
  } catch {}

  const mime = target === 'video/webm' ? 'video/webm' : 'video/mp4';
  return new Blob([data.buffer], { type: mime });
}

/* ---------------- 画像→PNG バイト列 ---------------- */

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

function detectSize(src: any): { width: number; height: number } {
  return {
    width: src?.videoWidth ?? src?.naturalWidth ?? src?.width ?? 720,
    height: src?.videoHeight ?? src?.naturalHeight ?? src?.height ?? 1280,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
