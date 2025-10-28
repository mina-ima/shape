// src/encode/ffmpeg.ts
// ffmpeg.wasm を使ってフレーム列 (cv.Mat[]) を動画 Blob にエンコードする。
// 希望 MIME（"video/webm" | "video/mp4"）を優先 → 失敗時フォールバック。
// 互換性重視のパラメータ（CFR, yuv420p, 無音）で出力。
// 追加: ロード/実行のタイムアウト、極小Blobの失敗扱い、詳細ログ、確実なFS掃除。

import cv from "@techstark/opencv-js";
import { FFmpeg } from "@ffmpeg/ffmpeg";

/* ---------------- ユーティリティ ---------------- */

/** Uint8Array -> ArrayBuffer（BlobPartはArrayBufferが安定） */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

/** Promiseにタイムアウトを付ける */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let to: any;
  const timer = new Promise<never>((_, rej) => {
    to = setTimeout(() => rej(new Error(`[Timeout] ${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timer]);
  } finally {
    clearTimeout(to);
  }
}

/** Mat(RGB/RGBA/Gray) → PNG(Uint8Array) へ変換（ffmpeg FS 用）
 * 重要：ImageData に渡す配列は必ず「自前確保の ArrayBuffer 」を裏に持つ Uint8ClampedArray を使う。
 * これで Vercel の tsc が期待する ImageData オーバーロードに一致させる。
 */
async function matToPngBytes(mat: cv.Mat): Promise<Uint8Array> {
  const w = mat.cols;
  const h = mat.rows;

  // OffscreenCanvas があれば優先
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : (() => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          return c;
        })();

  const ctx =
    "getContext" in canvas
      ? (canvas as HTMLCanvasElement).getContext("2d")
      : (canvas as OffscreenCanvas).getContext("2d");

  if (!ctx) throw new Error("Canvas 2D context not available.");

  // OpenCV.js の Mat は多くが RGBA。安全側に RGB/Gray も吸収。
  const srcU8 = mat.data as unknown as Uint8Array;
  const isRGBA = srcU8.length === w * h * 4;
  const isRGB = srcU8.length === w * h * 3;

  // ★ ArrayBufferLike 問題を避けるため、毎回「自前の ArrayBuffer」を確保してから詰める
  const rgbaAB = new ArrayBuffer(w * h * 4);
  const rgba = new Uint8ClampedArray(rgbaAB);

  if (isRGBA) {
    // そのままコピー
    rgba.set(srcU8);
  } else if (isRGB) {
    // RGB → RGBA
    let si = 0;
    let di = 0;
    const len = srcU8.length;
    while (si < len) {
      rgba[di++] = srcU8[si++]; // R
      rgba[di++] = srcU8[si++]; // G
      rgba[di++] = srcU8[si++]; // B
      rgba[di++] = 255;         // A
    }
  } else {
    // グレースケールなど
    const len = srcU8.length;
    for (let i = 0, j = 0; i < len; i++, j += 4) {
      const v = srcU8[i];
      rgba[j] = v;
      rgba[j + 1] = v;
      rgba[j + 2] = v;
      rgba[j + 3] = 255;
    }
  }

  const imageData = new ImageData(rgba, w, h);
  (ctx as CanvasRenderingContext2D).putImageData(imageData, 0, 0);

  // Canvas → PNG バイト列
  if ("convertToBlob" in canvas) {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
    const arr = await blob.arrayBuffer(); // ArrayBuffer
    return new Uint8Array(arr);           // Uint8Array に変換
  } else {
    const c = canvas as HTMLCanvasElement;
    const dataUrl = c.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1] || "";
    const bin = atob(base64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
}

/** FS の掃除 */
function fsList(n: number): string[] {
  const frames = Array.from({ length: n }, (_, i) => `frame${String(i + 1).padStart(4, "0")}.png`);
  return frames.concat(["out.webm", "out.mp4"]);
}
async function cleanupFf(files: string[], ffmpeg: FFmpeg) {
  for (const f of files) {
    try {
      await ffmpeg.deleteFile(f);
    } catch {
      /* ignore */
    }
  }
}

/* ---------------- 本体：ffmpeg でエンコード ---------------- */

/**
 * ffmpeg でエンコードを実行。
 * @param frames フレーム列（RGBA/ RGB 想定）
 * @param fps フレームレート
 * @param mimeType "video/webm" | "video/mp4"（希望値。失敗時はもう一方にフォールバック）
 * @returns Blob（type は実際の出力に合わせる）
 */
export async function encodeWithFFmpeg(
  frames: cv.Mat[],
  fps: number,
  mimeType: string,
): Promise<Blob> {
  if (!frames.length) return new Blob([], { type: mimeType });

  const MIN_VALID_SIZE = 10_000; // 10KB未満は壊れた出力扱い（フォールバック/失敗）
  const wantWebM = mimeType === "video/webm";
  const plans: Array<"webm" | "mp4"> = wantWebM ? ["webm", "mp4"] : ["mp4", "webm"];

  const ffmpeg = new FFmpeg();
  console.info("[FFmpeg] load() start");
  await withTimeout(ffmpeg.load(), 60_000, "ffmpeg.load");
  console.info("[FFmpeg] load() done");

  // 入力フレームを書き出し（frame0001.png, frame0002.png, ...）
  console.info("[FFmpeg] writing frames:", frames.length);
  for (let i = 0; i < frames.length; i++) {
    const png = await matToPngBytes(frames[i]);
    const name = `frame${String(i + 1).padStart(4, "0")}.png`;
    await ffmpeg.writeFile(name, png);
  }

  const makeWebM = async (): Promise<Blob> => {
    const out = "out.webm";
    const args = [
      "-framerate", String(fps),
      "-i", "frame%04d.png",
      "-c:v", "libvpx-vp8",
      "-pix_fmt", "yuv420p",
      "-b:v", "1500k",
      "-deadline", "realtime",
      "-row-mt", "1",
      "-an",
      out,
    ];
    console.info("[FFmpeg] exec webm start");
    await withTimeout(ffmpeg.exec(args), 180_000, "ffmpeg.exec webm");
    console.info("[FFmpeg] exec webm done");
    const u8 = (await withTimeout(ffmpeg.readFile(out), 30_000, "ffmpeg.readFile webm")) as Uint8Array;
    const ab: ArrayBuffer = toArrayBuffer(u8); // BlobPart は ArrayBuffer を渡す
    return new Blob([ab], { type: "video/webm" });
  };

  const makeMP4 = async (): Promise<Blob> => {
    const out = "out.mp4";
    const args = [
      "-framerate", String(fps),
      "-i", "frame%04d.png",
      "-c:v", "libx264",
      "-profile:v", "baseline",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      out,
    ];
    console.info("[FFmpeg] exec mp4 start");
    await withTimeout(ffmpeg.exec(args), 240_000, "ffmpeg.exec mp4");
    console.info("[FFmpeg] exec mp4 done");
    const u8 = (await withTimeout(ffmpeg.readFile(out), 30_000, "ffmpeg.readFile mp4")) as Uint8Array;
    const ab: ArrayBuffer = toArrayBuffer(u8);
    return new Blob([ab], { type: "video/mp4" });
  };

  // 実行（希望 → 逆順にフォールバック、最後に念押し WebM）
  let lastErr: unknown = null;
  try {
    for (const p of plans) {
      try {
        const blob = p === "webm" ? await makeWebM() : await makeMP4();
        console.info("[FFmpeg] produced:", p, "size=", blob.size);
        if (blob.size >= MIN_VALID_SIZE) {
          await cleanupFf(fsList(frames.length), ffmpeg);
          return blob;
        }
        throw new Error(`Blob too small (${blob.size} bytes)`);
      } catch (e) {
        lastErr = e;
        console.warn(`[FFmpeg] plan ${p} failed:`, e);
        // 次案にフォールバック
      }
    }
    // libx264 非搭載ビルド対策：最後に WebM を強制再挑戦
    const fallbackBlob = await makeWebM();
    console.info("[FFmpeg] forced webm size=", fallbackBlob.size);
    await cleanupFf(fsList(frames.length), ffmpeg);
    if (fallbackBlob.size >= MIN_VALID_SIZE) return fallbackBlob;
    throw new Error(`Fallback webm too small (${fallbackBlob.size} bytes)`);
  } catch (e) {
    lastErr = e;
    await cleanupFf(fsList(frames.length), ffmpeg);
    throw new Error(`ffmpeg.wasm failed for both MP4 and WebM. last error: ${String(lastErr)}`);
  }
}
