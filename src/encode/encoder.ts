import cv from "@techstark/opencv-js";
import { encodeWithWebCodecs } from "./webcodecs";
import { encodeWithMediaRecorder } from "./mediarec";
import { encodeWithFFmpeg } from "./ffmpeg";

/**
 * 非iOSでは webm、iOS では mp4 を優先。
 * テストでは UA をスタブして検証しているため UA ベースの分岐を維持。
 * SSR/Node でも navigator が未定義の場合に備えて安全に参照する。
 */
export function getPreferredMimeType(): "video/webm" | "video/mp4" {
  const nav: any = (typeof navigator !== "undefined" ? navigator : {}) as {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
  };

  const ua = (nav.userAgent || "").toLowerCase();

  // iOS 判定（iPhone/iPad/iPod または iPadOS のデスクトップUA）
  const isiOS =
    /iphone|ipad|ipod/.test(ua) ||
    // iPadOS は Mac として報告されるケースがあるため追加判定
    (!!nav.platform &&
      /mac/i.test(nav.platform) &&
      typeof nav.maxTouchPoints === "number" &&
      nav.maxTouchPoints > 1);

  return isiOS ? "video/mp4" : "video/webm";
}

/** SSRでも安全に機能検出できるよう globalThis を経由して存在チェック */
function hasWebCodecs(): boolean {
  const g: any = typeof globalThis !== "undefined" ? (globalThis as any) : {};
  return !!(g.VideoEncoder && typeof g.VideoEncoder === "function");
}

function hasMediaRecorder(): boolean {
  const g: any = typeof globalThis !== "undefined" ? (globalThis as any) : {};
  return !!(g.MediaRecorder && typeof g.MediaRecorder === "function");
}

export async function encodeVideo(
  frames: cv.Mat[],
  fps: number,
): Promise<Blob> {
  const preferredMimeType = getPreferredMimeType();
  const alternativeMimeType =
    preferredMimeType === "video/webm" ? "video/mp4" : "video/webm";

  // 1. Try WebCodecs
  if (hasWebCodecs()) {
    try {
      const blob = await encodeWithWebCodecs(frames, fps, preferredMimeType);
      console.log(`Encoded with WebCodecs as ${preferredMimeType}`);
      return blob;
    } catch (error) {
      console.warn(
        `WebCodecs failed with ${preferredMimeType}, retrying with ${alternativeMimeType}...`,
        error,
      );
      try {
        const blob = await encodeWithWebCodecs(frames, fps, alternativeMimeType);
        console.log(`Encoded with WebCodecs as ${alternativeMimeType}`);
        return blob;
      } catch (error2) {
        console.warn(
          `WebCodecs also failed with ${alternativeMimeType}, falling back...`,
          error2,
        );
      }
    }
  }

  // 2. Try MediaRecorder
  if (hasMediaRecorder()) {
    try {
      const blob = await encodeWithMediaRecorder(frames, fps, preferredMimeType);
      console.log(`Encoded with MediaRecorder as ${preferredMimeType}`);
      return blob;
    } catch (error) {
      console.warn(
        `MediaRecorder failed with ${preferredMimeType}, retrying with ${alternativeMimeType}...`,
        error,
      );
      try {
        const blob = await encodeWithMediaRecorder(
          frames,
          fps,
          alternativeMimeType,
        );
        console.log(`Encoded with MediaRecorder as ${alternativeMimeType}`);
        return blob;
      } catch (error2) {
        console.warn(
          `MediaRecorder also failed with ${alternativeMimeType}, falling back...`,
          error2,
        );
      }
    }
  }

  // 3. Try ffmpeg.wasm
  try {
    const blob = await encodeWithFFmpeg(frames, fps, preferredMimeType);
    console.log(`Encoded with ffmpeg.wasm as ${preferredMimeType}`);
    return blob;
  } catch (error) {
    console.warn(
      `ffmpeg.wasm failed with ${preferredMimeType}, retrying with ${alternativeMimeType}...`,
      error,
    );
    try {
      const blob = await encodeWithFFmpeg(frames, fps, alternativeMimeType);
      console.log(`Encoded with ffmpeg.wasm as ${alternativeMimeType}`);
      return blob;
    } catch (error2) {
      console.error(
        `ffmpeg.wasm also failed with ${alternativeMimeType}. All encoders failed.`,
        error2,
      );
    }
  }

  throw new Error("All video encoders failed.");
}
