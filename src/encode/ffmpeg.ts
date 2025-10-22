// src/encode/ffmpeg.ts
// ffmpeg.wasm を使ってフレーム列 (cv.Mat[]) を動画 Blob にエンコードする。
// 方針：希望 MIME（"video/webm" | "video/mp4"）を優先 → 失敗なら自動フォールバック。
// 互換性重視のパラメータ（CFR, yuv420p, 無音）で出力。

import cv from "@techstark/opencv-js";
import { FFmpeg } from "@ffmpeg/ffmpeg";

/* ---------------- 型安全ユーティリティ ---------------- */

/** Uint8Array -> ArrayBuffer（ArrayBufferLike を確実に ArrayBuffer に変換） */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

/** Mat(RGB/RGBA/Gray) → PNG(Uint8Array) へ変換（ffmpeg FS 用） */
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

  let rgba: Uint8ClampedArray;

  if (isRGBA) {
    // 型を確実に Uint8ClampedArray に固定
    rgba = new Uint8ClampedArray(srcU8); // コピー生成（.buffer を直接使わない）
  } else if (isRGB) {
    rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < srcU8.length; i += 3, j += 4) {
      rgba[j] = srcU8[i];
      rgba[j + 1] = srcU8[i + 1];
      rgba[j + 2] = srcU8[i + 2];
      rgba[j + 3] = 255;
    }
  } else {
    // グレースケールなど
    rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < srcU8.length; i += 1, j += 4) {
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
    const arr = await blob.arrayBuffer();
    return new Uint8Array(arr);
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

  const wantWebM = mimeType === "video/webm";
  const plans: Array<"webm" | "mp4"> = wantWebM ? ["webm", "mp4"] : ["mp4", "webm"];

  const ffmpeg = new FFmpeg();
  await ffmpeg.load();

  // 入力フレームを書き出し（frame0001.png, frame0002.png, ...）
  for (let i = 0; i < frames.length; i++) {
    const png = await matToPngBytes(frames[i]);
    const name = `frame${String(i + 1).padStart(4, "0")}.png`;
    await ffmpeg.writeFile(name, png);
  }

  const makeWebM = async (): Promise<Blob> => {
    const out = "out.webm";
    const args = [
      "-framerate",
      String(fps),
      "-i",
      "frame%04d.png",
      "-c:v",
      "libvpx-vp8",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      "1500k",
      "-deadline",
      "realtime",
      "-row-mt",
      "1",
      "-an",
      out,
    ];
    await ffmpeg.exec(args);
    const u8 = (await ffmpeg.readFile(out)) as Uint8Array;
    // BlobPart に ArrayBuffer を渡すと型がより安定（ArrayBufferLike問題を回避）
    const ab: ArrayBuffer = toArrayBuffer(u8);
    return new Blob([ab], { type: "video/webm" });
  };

  const makeMP4 = async (): Promise<Blob> => {
    const out = "out.mp4";
    const args = [
      "-framerate",
      String(fps),
      "-i",
      "frame%04d.png",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      out,
    ];
    await ffmpeg.exec(args);
    const u8 = (await ffmpeg.readFile(out)) as Uint8Array;
    const ab: ArrayBuffer = toArrayBuffer(u8);
    return new Blob([ab], { type: "video/mp4" });
  };

  // 実行（希望 → 逆順にフォールバック、最後に念押し WebM）
  let lastErr: unknown = null;
  try {
    for (const p of plans) {
      try {
        const blob = p === "webm" ? await makeWebM() : await makeMP4();
        await cleanupFf(fsList(frames.length), ffmpeg);
        return blob;
      } catch (e) {
        lastErr = e;
        // 次案にフォールバック
      }
    }
    // libx264 非搭載ビルド対策：最後に WebM を強制再挑戦
    const fallbackBlob = await makeWebM();
    await cleanupFf(fsList(frames.length), ffmpeg);
    return fallbackBlob;
  } catch (e) {
    lastErr = e;
    await cleanupFf(fsList(frames.length), ffmpeg);
    throw new Error(`ffmpeg.wasm failed for both MP4 and WebM. last error: ${String(lastErr)}`);
  }
}
