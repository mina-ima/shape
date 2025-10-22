// src/encode/ffmpeg.ts
// ffmpeg.wasm を用いてフレーム列 (cv.Mat[]) を動画 Blob にエンコードする。
// ポイント：
// - まずリクエストされた MIME（"video/webm" | "video/mp4"）を試行
// - 失敗したら自動でもう一方にフォールバック（libx264 非搭載や端末差を吸収）
// - 共通設定：CFR、yuv420p、無音（-an）、出力後にFS掃除

import cv from "@techstark/opencv-js";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// Mat(RGBA/RGB) → PNG(Uint8Array) へ変換（ffmpeg FS に書き込むため）
async function matToPngBytes(mat: cv.Mat): Promise<Uint8Array> {
  const w = mat.cols;
  const h = mat.rows;
  // OffscreenCanvas が使えれば優先
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

  // Mat のチャンネル数を確認（3=RGB、4=RGBA）
  const channels = (mat.channels && typeof mat.channels === "function")
    ? mat.channels()
    : (mat.cols * mat.rows * 4 === (mat.data?.length ?? 0) ? 4 : 3);

  let rgbaU8: Uint8ClampedArray;

  if (channels === 4) {
    // そのまま RGBA として取り扱い
    rgbaU8 = new Uint8ClampedArray(mat.data as unknown as ArrayBufferLike);
  } else if (channels === 3) {
    // RGB → RGBA に拡張
    const src = mat.data as unknown as Uint8Array;
    rgbaU8 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
      rgbaU8[j] = src[i];
      rgbaU8[j + 1] = src[i + 1];
      rgbaU8[j + 2] = src[i + 2];
      rgbaU8[j + 3] = 255;
    }
  } else {
    // 想定外：グレースケール等は簡易に RGBA へ
    const src = mat.data as unknown as Uint8Array;
    rgbaU8 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < src.length; i += 1, j += 4) {
      const v = src[i];
      rgbaU8[j] = v;
      rgbaU8[j + 1] = v;
      rgbaU8[j + 2] = v;
      rgbaU8[j + 3] = 255;
    }
  }

  const imageData = new ImageData(rgbaU8, w, h);
  (ctx as CanvasRenderingContext2D).putImageData(imageData, 0, 0);

  // Canvas → PNG バイト列
  if ("convertToBlob" in canvas) {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
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

// 出力・一時ファイルの掃除
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

  // それぞれの出力関数
  const makeWebM = async () => {
    const out = "out.webm";
    // 互換重視：libvpx-vp8 / yuv420p / CFR / 無音
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
    const data = (await ffmpeg.readFile(out)) as Uint8Array;
    return new Blob([data], { type: "video/webm" });
  };

  const makeMP4 = async () => {
    const out = "out.mp4";
    // 互換重視：libx264 / baseline / yuv420p / faststart
    // ※ ビルドに libx264 が含まれていない場合はここでエラーになる
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
    const data = (await ffmpeg.readFile(out)) as Uint8Array;
    return new Blob([data], { type: "video/mp4" });
  };

  // 実行
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
    // 念のため WebM を強制再試行（libx264 非搭載ビルド対策）
    const fallbackBlob = await makeWebM();
    await cleanupFf(fsList(frames.length), ffmpeg);
    return fallbackBlob;
  } catch (e) {
    lastErr = e;
    await cleanupFf(fsList(frames.length), ffmpeg);
    throw new Error(
      `ffmpeg.wasm failed for both MP4 and WebM. last error: ${String(lastErr)}`
    );
  }
}
