import cv from "@techstark/opencv-js";
import { encodeWithWebCodecs } from "./webcodecs";
import { encodeWithMediaRecorder } from "./mediarec";
import { encodeWithFFmpeg } from "./ffmpeg";

/**
 * 非 iOS では WebM、iOS では MP4 を優先。
 * さらに localStorage の 'FORCE_MIME' で 'mp4' | 'webm' を強制上書きできる。
 */
export function getPreferredMimeType(): "video/webm" | "video/mp4" {
  // デバッグ・検証用の強制上書き（任意）
  if (typeof window !== "undefined") {
    const forced = localStorage.getItem("FORCE_MIME");
    if (forced === "mp4") return "video/mp4";
    if (forced === "webm") return "video/webm";
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS のデスクトップ表示対策（タッチがある Mac Safari を iOS とみなす）
    (!!ua &&
      /Macintosh/.test(ua) &&
      typeof document !== "undefined" &&
      "ontouchend" in document);

  return isIOS ? "video/mp4" : "video/webm";
}

/** Blob.type が空や不正のときに MIME を補正する */
function ensureBlobType(blob: Blob, mime: string): Blob {
  if (blob.type && blob.type === mime) return blob;
  // 一部ブラウザ/実装で type が空になることがあるので上書き
  return new Blob([blob], { type: mime });
}

/** WebCodecs は WebM (VP8/VP9/AV1) のみを前提として使う */
function canUseWebCodecsFor(mime: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).VideoEncoder !== "function") return false;
  return mime === "video/webm";
}

function canUseMediaRecorderFor(mime: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).MediaRecorder !== "function") return false;
  // isTypeSupported が無いブラウザもあるので、その場合は一旦試す
  const MR: any = (window as any).MediaRecorder;
  return typeof MR.isTypeSupported === "function"
    ? !!MR.isTypeSupported(mime)
    : true;
}

export async function encodeVideo(
  frames: cv.Mat[],
  fps: number,
): Promise<Blob> {
  const preferred = getPreferredMimeType();
  const alternative = preferred === "video/webm" ? "video/mp4" : "video/webm";

  // 非 iOS（= WebM 優先）
  if (preferred === "video/webm") {
    // 1) WebCodecs (WebM のみ)
    if (canUseWebCodecsFor("video/webm")) {
      try {
        const blob = await encodeWithWebCodecs(frames, fps, "video/webm");
        const out = ensureBlobType(blob, "video/webm");
        console.log(`Encoded with WebCodecs as ${out.type}`);
        return out;
      } catch (err) {
        console.warn(`WebCodecs failed with video/webm. Falling back...`, err);
      }
    }

    // 2) MediaRecorder (WebM)
    if (canUseMediaRecorderFor("video/webm")) {
      try {
        const blob = await encodeWithMediaRecorder(frames, fps, "video/webm");
        const out = ensureBlobType(blob, "video/webm");
        console.log(`Encoded with MediaRecorder as ${out.type}`);
        return out;
      } catch (err) {
        console.warn(`MediaRecorder failed with video/webm. Falling back...`, err);
      }
    }

    // 3) ffmpeg.wasm (まず WebM、ダメなら MP4)
    try {
      const blob = await encodeWithFFmpeg(frames, fps, "video/webm");
      const out = ensureBlobType(blob, "video/webm");
      console.log(`Encoded with ffmpeg.wasm as ${out.type}`);
      return out;
    } catch (err) {
      console.warn(
        `ffmpeg.wasm failed with video/webm, retrying with video/mp4...`,
        err,
      );
      try {
        const blob = await encodeWithFFmpeg(frames, fps, "video/mp4");
        const out = ensureBlobType(blob, "video/mp4");
        console.log(`Encoded with ffmpeg.wasm as ${out.type}`);
        return out;
      } catch (err2) {
        console.error(
          `ffmpeg.wasm also failed with video/mp4. All encoders failed.`,
          err2,
        );
      }
    }
  } else {
    // iOS（= MP4 優先）
    // 1) MediaRecorder (MP4)
    if (canUseMediaRecorderFor("video/mp4")) {
      try {
        const blob = await encodeWithMediaRecorder(frames, fps, "video/mp4");
        const out = ensureBlobType(blob, "video/mp4");
        console.log(`Encoded with MediaRecorder as ${out.type}`);
        return out;
      } catch (err) {
        console.warn(`MediaRecorder failed with video/mp4. Falling back...`, err);
      }
    }

    // 2) ffmpeg.wasm (MP4)
    try {
      const blob = await encodeWithFFmpeg(frames, fps, "video/mp4");
      const out = ensureBlobType(blob, "video/mp4");
      console.log(`Encoded with ffmpeg.wasm as ${out.type}`);
      return out;
    } catch (err) {
      console.warn(`ffmpeg.wasm failed with video/mp4. Trying WebM fallbacks...`, err);
    }

    // 3) WebM 側の救済（まず WebCodecs、次に MediaRecorder、最後に ffmpeg.wasm）
    if (canUseWebCodecsFor("video/webm")) {
      try {
        const blob = await encodeWithWebCodecs(frames, fps, "video/webm");
        const out = ensureBlobType(blob, "video/webm");
        console.log(`Encoded with WebCodecs as ${out.type} (fallback from MP4)`);
        return out;
      } catch (err) {
        console.warn(`WebCodecs failed with video/webm (fallback from MP4).`, err);
      }
    }

    if (canUseMediaRecorderFor("video/webm")) {
      try {
        const blob = await encodeWithMediaRecorder(frames, fps, "video/webm");
        const out = ensureBlobType(blob, "video/webm");
        console.log(`Encoded with MediaRecorder as ${out.type} (fallback from MP4)`);
        return out;
      } catch (err) {
        console.warn(`MediaRecorder failed with video/webm (fallback from MP4).`, err);
      }
    }

    try {
      const blob = await encodeWithFFmpeg(frames, fps, "video/webm");
      const out = ensureBlobType(blob, "video/webm");
      console.log(`Encoded with ffmpeg.wasm as ${out.type} (fallback from MP4)`);
      return out;
    } catch (err) {
      console.error(
        `ffmpeg.wasm also failed with video/webm. All encoders failed.`,
        err,
      );
    }
  }

  throw new Error("All video encoders failed.");
}
