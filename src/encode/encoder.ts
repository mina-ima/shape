// src/encode/encoder.ts
/* eslint-disable no-console */

/* ---------------- ffmpeg ローダ（corePath 自動解決つき） ---------------- */
// 返す関数は createFFmpeg(opts) を呼べるファクトリ
async function getCreateFFmpeg(): Promise<null | ((opts: any) => any)> {
  try {
    const mod: any = await import("@ffmpeg/ffmpeg");
    const create = mod?.createFFmpeg ?? mod?.default?.createFFmpeg;
    if (typeof create !== "function") return null;

    // corePath を呼び出し側が未指定なら以下の順で解決:
    // 1) /ffmpeg/ffmpeg-core.js（public 配下）
    // 2) 既定解決（bundler/CDN）
    const wrapped = (opts: any = {}) => {
      const corePath =
        opts.corePath ??
        (typeof window !== "undefined" ? "/ffmpeg/ffmpeg-core.js" : undefined);
      return create({ log: false, ...opts, corePath });
    };
    return wrapped;
  } catch {
    return null; // 依存が解決できない環境では ffmpeg をスキップ
  }
}

type Mime = "video/webm" | "video/mp4";

export interface EncodeOptions {
  fps: number;
  preferredMime?: Mime; // 明示指定があれば優先
}
type EncodeInput = number | EncodeOptions;

/* ---------------- 判定ユーティリティ ---------------- */

function isIOS(): boolean {
  const ua = navigator.userAgent;
  const platform = (navigator as any).platform || "";
  const iOSFamily = /\b(iPad|iPhone|iPod)\b/.test(ua) && !/Android/i.test(ua);
  const touchOnMac = /Macintosh/.test(ua) && "ontouchend" in document;
  const applePlatform = /iPad|iPhone|iPod/.test(platform);
  return iOSFamily || touchOnMac || applePlatform;
}

function isSafari(): boolean {
  const ua = navigator.userAgent;
  const isSafariUA =
    /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/.test(ua);
  return isSafariUA || isIOS();
}

function canCaptureStream(): boolean {
  const htmlCanvasProto = (HTMLCanvasElement as any)?.prototype;
  const offscreenProto = (globalThis as any).OffscreenCanvas?.prototype;
  return (
    typeof htmlCanvasProto?.captureStream === "function" ||
    typeof offscreenProto?.captureStream === "function"
  );
}

// 実機の再生可否で優先MIMEを決定
function canPlay(mime: Mime): boolean {
  const v = document.createElement("video");
  const candidates =
    mime === "video/mp4"
      ? [
          'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
          'video/mp4; codecs="avc1.4d401e"',
          "video/mp4",
        ]
      : [
          'video/webm; codecs="vp9,opus"',
          'video/webm; codecs="vp8,opus"',
          "video/webm",
        ];
  return candidates.some((mt) => v.canPlayType(mt) !== "");
}

export function getPreferredMimeType(): Mime {
  try {
    const forced = localStorage.getItem("FORCE_MIME");
    if (forced === "mp4") return "video/mp4";
    if (forced === "webm") return "video/webm";
  } catch {}
  const mp4OK = canPlay("video/mp4");
  const webmOK = canPlay("video/webm");

  // 両方いける→iOS/Safariはmp4、それ以外はwebm（Androidでmp4を避ける）
  if (mp4OK && webmOK) return isIOS() || isSafari() ? "video/mp4" : "video/webm";
  if (webmOK) return "video/webm";
  if (mp4OK) return "video/mp4";
  // どちらも判断できない（happy-dom 等）→ 非iOS/非Safari は webm を既定に
  return isIOS() || isSafari() ? "video/mp4" : "video/webm";
}

function altPreferred(mime: Mime): Mime {
  return mime === "video/webm" ? "video/mp4" : "video/webm";
}
function normalizeOptions(opts: EncodeInput): EncodeOptions {
  return typeof opts === "number" ? { fps: opts } : opts;
}

/* ---------------- フレーム型サポート（drawImage可能に正規化） ---------------- */

type ImageDataLike = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};
type AnyFrame =
  | CanvasImageSource
  | ImageData
  | ImageDataLike
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Float32Array
  | ArrayBuffer
  | number[]
  | Blob
  | string
  | Promise<any>
  | {
      pixels?: any;
      data?: any;
      width?: number;
      height?: number;
      channels?: number;
      url?: string;
      src?: string;
      type?: string;
      format?: string;
      base64?: string;
    }
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
    typeof x.width === "number" &&
    typeof x.height === "number"
  );
}
function ensureUint8Clamped(buf: ArrayLike<number>): Uint8ClampedArray {
  if (buf instanceof Uint8ClampedArray) return buf;
  if (buf instanceof Uint8Array)
    return new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Uint8ClampedArray(buf.length);
  for (let i = 0; i < out.length; i++) {
    let v = (buf as any)[i] ?? 0;
    if (typeof v !== "number") v = Number(v) || 0;
    if (v > 255) v = 255;
    else if (v < 0) v = 0;
    out[i] = v;
  }
  return out;
}
function makeImageData(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): ImageData {
  const expectedLen = w * h * 4;
  const copy = new Uint8ClampedArray(expectedLen);
  copy.set(data.subarray(0, Math.min(expectedLen, data.length)));
  return new ImageData(copy, w, h);
}
function expandToRgba(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  channels: number,
): Uint8ClampedArray {
  if (channels === 4) return buf;
  const out = new Uint8ClampedArray(w * h * 4);
  if (channels === 1) {
    for (let i = 0, j = 0; i < buf.length; i += 1, j += 4) {
      const v = buf[i];
      out[j] = v;
      out[j + 1] = v;
      out[j + 2] = v;
      out[j + 3] = 255;
    }
  } else if (channels === 3) {
    for (let i = 0, j = 0; i < buf.length; i += 3, j += 4) {
      out[j] = buf[i];
      out[j + 1] = buf[i + 1];
      out[j + 2] = buf[i + 2];
      out[j + 3] = 255;
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
    (img as any).decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
function base64ToBlob(b64: string, mime = "image/png"): Blob {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
async function stringToDrawable(s: string): Promise<CanvasImageSource> {
  if (s.startsWith("data:")) {
    try {
      return await loadImage(s);
    } catch {
      const m = s.match(/^data:(.*?);base64,(.*)$/);
      if (m) {
        const mime = m[1] || "image/png";
        const blob = base64ToBlob(m[2], mime);
        return await createImageBitmap(blob);
      }
    }
  }
  if (
    s.startsWith("blob:") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  ) {
    return await loadImage(s);
  }
  if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 100) {
    const blob = base64ToBlob(s, "image/png");
    return await createImageBitmap(blob);
  }
  throw new TypeError("stringToDrawable: unsupported string format");
}

async function toDrawable(
  src: AnyFrame,
  fallbackSize?: { width: number; height: number },
): Promise<CanvasImageSource> {
  if (src && typeof (src as Promise<any>).then === "function") {
    const resolved = await (src as Promise<any>);
    return toDrawable(resolved, fallbackSize);
  }
  if (isCanvasImageSource(src)) return src as CanvasImageSource;
  if ((src as any)?.canvas && isCanvasImageSource((src as any).canvas))
    return (src as any).canvas;
  if ((src as any)?.bitmap) {
    let b = (src as any).bitmap;
    if (b && typeof (b as Promise<any>)?.then === "function") b = await b;
    if (isCanvasImageSource(b)) return b;
    if (b && typeof b === "object" && "close" in b) return b as CanvasImageSource;
  }
  if ((src as any)?.image && isCanvasImageSource((src as any).image))
    return (src as any).image;
  if ((src as any)?.video && isCanvasImageSource((src as any).video))
    return (src as any).video;
  if (
    src &&
    typeof src === "object" &&
    typeof (src as any).width === "number" &&
    typeof (src as any).height === "number" &&
    ((src as any).getContext || (src as any).toDataURL)
  ) {
    return src as any;
  }
  if (src instanceof ImageData || isImageDataLike(src)) {
    const w = (src as any).width ?? fallbackSize?.width ?? 720;
    const h = (src as any).height ?? fallbackSize?.height ?? 1280;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    const data =
      src instanceof ImageData ? src.data : ensureUint8Clamped((src as any).data);
    const channels = (src as any).channels ?? 4;
    const rgba =
      channels === 4 ? data : expandToRgba(ensureUint8Clamped(data), w, h, channels);
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
        : src instanceof Float32Array || src instanceof Uint16Array || Array.isArray(src)
        ? ensureUint8Clamped(src as any)
        : (src as Uint8Array | Uint8ClampedArray);
    const rgba = ensureUint8Clamped(bytes);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    const id = makeImageData(rgba, w, h);
    ctx.putImageData(id, 0, 0);
    return c;
  }
  if (typeof src === "object" && src) {
    const maybe = src as any;
    if (typeof maybe.base64 === "string" || typeof maybe.data === "string") {
      const b64 = (maybe.base64 ?? maybe.data) as string;
      const mime = (maybe.format ?? maybe.type ?? "image/png") as string;
      try {
        const blob = base64ToBlob(b64.replace(/^data:.*;base64,/, ""), mime);
        return await createImageBitmap(blob);
      } catch {}
    }
    if (
      (maybe.pixels || maybe.data) &&
      typeof maybe.width === "number" &&
      typeof maybe.height === "number"
    ) {
      const w = maybe.width,
        h = maybe.height;
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
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("2D context unavailable");
      const id = makeImageData(rgba, w, h);
      ctx.putImageData(id, 0, 0);
      return c;
    }
    const rawUrl = (maybe.url ?? maybe.src) as string | undefined;
    if (typeof rawUrl === "string") {
      return await loadImage(rawUrl);
    }
  }
  if (src instanceof Blob) {
    return await createImageBitmap(src);
  }
  if (typeof src === "string") {
    return await stringToDrawable(src);
  }
  if (fallbackSize) {
    const c = document.createElement("canvas");
    c.width = fallbackSize.width;
    c.height = fallbackSize.height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.clearRect(0, 0, c.width, c.height);
    return c;
  }
  throw new TypeError("toDrawable: unsupported frame type for drawImage");
}

/* ---------------- パブリックAPI ---------------- */

export async function encodeVideo(
  frames: AnyFrame[],
  opts: EncodeInput,
): Promise<Blob> {
  const { blob } = await encodeVideoWithMeta(frames, normalizeOptions(opts));
  return blob;
}

// 空配列時の黒キャンバスを用意（テストやフォールバック経路のため）
function makeBlackCanvas(w = 16, h = 16): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  return c;
}

export async function encodeVideoWithMeta(
  frames: AnyFrame[],
  { fps, preferredMime }: EncodeOptions,
): Promise<{ blob: Blob; filename: string; mime: Mime }> {
  // 空入力は黒1フレームで継続
  const framesSafe = frames?.length ? frames : [makeBlackCanvas(16, 16)];

  const primary: Mime = preferredMime ?? getPreferredMimeType();
  const secondary: Mime = altPreferred(primary);

  // 1) MediaRecorder 優先（Androidでは webm を先に試す前提）
  if (
    typeof (globalThis as any).MediaRecorder === "function" &&
    canCaptureStream()
  ) {
    try {
      const blob1 = await encodeWithMediaRecorder(framesSafe, fps, primary);
      console.log("[Encode] MediaRecorder-1 type/size:", blob1.type, blob1.size);

      if (await needsRemuxOrReencode(blob1)) {
        console.warn(
          "[Encode] MR-1 output looks fragmented/too small → ffmpeg fix…",
        );
        const fixed = await fixWithFFmpeg(blob1, fps);
        return { blob: fixed, filename: "output.mp4", mime: "video/mp4" };
      }
      if (await isPlayableOnThisBrowser(blob1)) {
        const mime1 = (blob1.type || primary) as Mime;
        const name1 = mime1 === "video/mp4" ? "output.mp4" : "output.webm";
        return { blob: blob1, filename: name1, mime: mime1 };
      }

      console.warn(
        "Playback probe failed. Retrying with alternate MediaRecorder settings…",
      );
      const blob2 = await encodeWithMediaRecorder(framesSafe, fps, secondary);
      console.log("[Encode] MediaRecorder-2 type/size:", blob2.type, blob2.size);

      if (await needsRemuxOrReencode(blob2)) {
        console.warn(
          "[Encode] MR-2 output looks fragmented/too small → ffmpeg fix…",
        );
        const fixed = await fixWithFFmpeg(blob2, fps);
        return { blob: fixed, filename: "output.mp4", mime: "video/mp4" };
      }
      if (await isPlayableOnThisBrowser(blob2)) {
        const mime2 = (blob2.type || secondary) as Mime;
        const name2 = mime2 === "video/mp4" ? "output.mp4" : "output.webm";
        return { blob: blob2, filename: name2, mime: mime2 };
      }
    } catch (e1) {
      console.warn("MediaRecorder path failed", e1);
    }
  } else {
    console.log(
      "MediaRecorder skipped: captureStream() not supported or MediaRecorder missing.",
    );
  }

  // 2) ffmpeg.wasm（確実な mp4 生成: H.264 Baseline + yuv420p + faststart）
  try {
    const mp4 = await encodeWithFFmpeg(framesSafe, fps, "video/mp4");
    console.log("[Encode] ffmpeg mp4 type/size:", mp4.type, mp4.size);
    return { blob: mp4, filename: "output.mp4", mime: "video/mp4" };
  } catch (e) {
    console.warn("ffmpeg.wasm unavailable or failed:", e);
    // どうしても ffmpeg が使えない環境向けの最終フォールバック
    const tryBlob = await safeBestEffortMedia(framesSafe, fps);
    const sniffed = await sniffContainerMime(tryBlob);
    const mime = (sniffed || tryBlob.type || getPreferredMimeType()) as Mime;
    const name = mime === "video/mp4" ? "output.mp4" : "output.webm";
    return { blob: setBlobType(tryBlob, mime), filename: name, mime };
  }
}

/* ---------------- MediaRecorder 実装 ---------------- */

const MIN_VALID_SIZE = 64 * 1024; // 64KB 未満は破損/短尺とみなす

function pickMediaRecorderMime(target: Mime): string | undefined {
  const candidates =
    target === "video/webm"
      ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=vp8",
          "video/webm",
        ]
      : ["video/mp4;codecs=avc1.42E01E", "video/mp4"];
  for (const c of candidates) {
    if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

/* ---- 追加：コンテナシグネチャ優先の MIME 推定 ---- */
async function sniffContainerMime(blob: Blob): Promise<Mime | null> {
  if (!blob || blob.size < 12) return null;
  try {
    const head = new Uint8Array(
      await blob.slice(0, Math.min(4096, blob.size)).arrayBuffer(),
    );
    // WebM (Matroska/EBML): 0x1A 45 DF A3
    const isWebM =
      head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    if (isWebM) return "video/webm";

    // ISO-BMFF/MP4: [size(4 bytes)] + 'ftyp'（ASCII）→ 4バイト目から 'f' 't' 'y' 'p'
    const isMP4 =
      head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
    if (isMP4) return "video/mp4";
  } catch {}
  return null;
}

// Blob のペイロードはそのままに MIME だけ付け替える
function setBlobType(src: Blob, mime: string): Blob {
  return new Blob([src], { type: mime });
}

async function encodeWithMediaRecorder(
  frames: AnyFrame[],
  fps: number,
  target: Mime,
): Promise<Blob> {
  const firstDrawable = await toDrawable(frames[0] as any, {
    width: 720,
    height: 1280,
  });
  const { width, height } = detectSize(firstDrawable as any);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  const stream: MediaStream = (canvas as any).captureStream
    ? (canvas as any).captureStream(fps)
    : (canvas as any).captureStream?.();

  if (!stream) throw new Error("Canvas.captureStream() is not supported.");

  const prefer = pickMediaRecorderMime(target);
  const options: MediaRecorderOptions = prefer
    ? { mimeType: prefer, videoBitsPerSecond: 4_000_000 }
    : { videoBitsPerSecond: 4_000_000 };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch {
    recorder = new MediaRecorder(stream);
  }

  const chunks: Blob[] = [];
  let chunkType: string | undefined;

  const started = new Promise<void>((resolve, reject) => {
    recorder.onstart = () => resolve();
    recorder.onerror = (ev: any) => reject(ev?.error ?? new Error("MR error"));
  });
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
        if (!chunkType && ev.data.type) chunkType = ev.data.type;
      }
    };
    recorder.onstop = async () => {
      // まずは recorder / options / chunk type から推定
      const guessed =
        (chunkType && chunkType.split(";")[0]) ||
        ((recorder as any).mimeType?.split?.(";")?.[0]) ||
        ((options as any).mimeType?.split?.(";")?.[0]) ||
        target;

      let out = new Blob(chunks, { type: guessed });

      // ★ ここが決定打：シグネチャで実コンテナを最終確認して MIME を補正
      const sniffed = await sniffContainerMime(out);
      if (sniffed && !guessed.startsWith(sniffed)) {
        console.warn(
          `[Encode] MIME corrected by signature: ${guessed} → ${sniffed}`,
        );
        out = setBlobType(out, sniffed);
      }

      try {
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    recorder.onerror = (ev: any) => reject(ev?.error ?? new Error("MR error"));
  });

  // timeslice あり：mux安定化
  recorder.start(200);
  await started;

  const frameInterval = Math.max(4, Math.round(1000 / Math.max(1, fps)));

  for (let i = 0; i < frames.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const drawable = await toDrawable(frames[i] as any, { width, height });
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(drawable as any, 0, 0, width, height);
    // eslint-disable-next-line no-await-in-loop
    await sleep(frameInterval);
  }

  // 終端安定
  await sleep(frameInterval);

  if (recorder.state !== "inactive") recorder.stop();
  const blob = await done;

  stream.getTracks().forEach((t) => t.stop());

  if (!blob || blob.size < MIN_VALID_SIZE) {
    throw new Error(`Recorded blob too small (${blob?.size ?? 0} bytes)`);
  }
  return blob;
}

/* ---- 再生可否プローブ ---- */
async function isPlayableOnThisBrowser(
  blob: Blob,
  timeoutMs = 5000,
): Promise<boolean> {
  if (!blob || blob.size < 20_000) return false;
  const t = (blob.type || "").toLowerCase();
  if (isSafari() && /webm/.test(t)) return false;

  try {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    (v as any).playsInline = true;
    v.src = url;

    const ok = await new Promise<boolean>((resolve) => {
      const to = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      let progressed = false;
      function cleanup() {
        clearTimeout(to);
        v.pause();
        URL.revokeObjectURL(url);
      }
      v.oncanplay = async () => {
        try {
          await v.play();
        } catch {
          cleanup();
          resolve(false);
        }
      };
      v.ontimeupdate = () => {
        if (v.currentTime > 0) progressed = true;
      };
      v.onplaying = () => {
        setTimeout(() => {
          const yes =
            progressed && v.readyState >= 2 && isFinite(v.duration) && v.duration > 0;
          cleanup();
          resolve(yes);
        }, 150);
      };
      v.onerror = () => {
        cleanup();
        resolve(false);
      };
    });

    return ok;
  } catch {
    return false;
  }
}

/* ---- 断片化/再エンコード判定 ---- */
async function needsRemuxOrReencode(blob: Blob): Promise<boolean> {
  const type = (blob.type || "").toLowerCase();
  if (/webm/.test(type)) {
    // webm でも極小は危険
    return blob.size < MIN_VALID_SIZE;
  }
  if (!/mp4/.test(type)) return blob.size < MIN_VALID_SIZE;
  if (blob.size < MIN_VALID_SIZE) return true;

  // 先頭〜2MBを見て 'moof' があれば fMP4
  const slice = await blob.slice(0, Math.min(blob.size, 2_000_000)).arrayBuffer();
  const s = new TextDecoder("latin1").decode(new Uint8Array(slice));
  return s.includes("moof"); // 断片化（movie fragment）
}

/* ---- ffmpeg 修復（remux or 再エンコード） ---- */
async function fixWithFFmpeg(src: Blob, fps: number): Promise<Blob> {
  const createFFmpeg = await getCreateFFmpeg();
  if (!createFFmpeg) throw new Error("ffmpeg-unavailable");

  const ffmpeg = createFFmpeg({});
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const inBuf = new Uint8Array(await src.arrayBuffer());
  ffmpeg.FS("writeFile", "in.bin", inBuf);

  const type = (src.type || "").toLowerCase();
  let outName = "out.mp4";

  if (/mp4/.test(type)) {
    // コピーコーデックで MP4 を progressive に（moov を先頭へ）
    await ffmpeg.run(
      "-i",
      "in.bin",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outName,
    );
  } else {
    // それ以外は h264 baseline + yuv420p に再エンコード
    await ffmpeg.run(
      "-r",
      String(fps),
      "-i",
      "in.bin",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outName,
    );
  }

  const out = ffmpeg.FS("readFile", outName);
  try {
    ffmpeg.FS("unlink", "in.bin");
    ffmpeg.FS("unlink", outName);
  } catch {}
  return new Blob([out], { type: "video/mp4" });
}

/* ---- 最終フォールバック用（保存可能な Blob を作る） ---- */
async function safeBestEffortMedia(
  frames: AnyFrame[],
  fps: number,
): Promise<Blob> {
  try {
    const b = await encodeWithMediaRecorder(frames, fps, getPreferredMimeType());
    if (b && b.size > 0) return b;
  } catch {}
  // ✅ happy-dom では toDataURL()/toBlob 未実装のため使わない
  // 「保存できる最小の Blob」を返す
  return new Blob([new Uint8Array([0])], { type: "application/octet-stream" });
}

/* ---------------- ffmpeg.wasm での新規エンコード ---------------- */

async function encodeWithFFmpeg(
  frames: AnyFrame[],
  fps: number,
  target: Mime,
): Promise<Blob> {
  const createFFmpeg = await getCreateFFmpeg();
  if (!createFFmpeg) throw new Error("ffmpeg-unavailable");

  const ffmpeg = createFFmpeg({});
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const firstDrawable = await toDrawable(frames[0] as any, {
    width: 720,
    height: 1280,
  });
  const { width, height } = detectSize(firstDrawable as any);

  for (let i = 0; i < frames.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const drawable = await toDrawable(frames[i] as any, { width, height });
    const png = canvasSourceToPng(drawable as any, width, height);
    ffmpeg.FS("writeFile", `frame_${String(i).padStart(5, "0")}.png`, png);
  }

  const out = target === "video/webm" ? "out.webm" : "out.mp4";
  const args =
    target === "video/webm"
      ? [
          "-framerate",
          String(fps),
          "-i",
          "frame_%05d.png",
          "-c:v",
          "libvpx-vp8",
          "-b:v",
          "2M",
          "-pix_fmt",
          "yuv420p",
          out,
        ]
      : [
          "-framerate",
          String(fps),
          "-i",
          "frame_%05d.png",
          "-c:v",
          "libx264",
          "-profile:v",
          "baseline",
          "-level",
          "3.1",
          "-b:v",
          "2M",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          out,
        ];

  await ffmpeg.run(...args);
  const data = ffmpeg.FS("readFile", out); // Uint8Array

  try {
    for (let i = 0; i < frames.length; i++)
      ffmpeg.FS("unlink", `frame_${String(i).padStart(5, "0")}.png`);
    ffmpeg.FS("unlink", out);
  } catch {}

  const mime = target === "video/webm" ? "video/webm" : "video/mp4";
  return new Blob([data], { type: mime });
}

/* ---------------- 画像→PNG バイト列 ---------------- */

function canvasSourceToPng(
  src: CanvasImageSource,
  width: number,
  height: number,
): Uint8Array {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.drawImage(src as any, 0, 0, width, height);
  const dataUrl = c.toDataURL("image/png");
  const bin = atob(dataUrl.split(",")[1]);
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
