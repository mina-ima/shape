import cv from "@techstark/opencv-js";
import { encodeWithWebCodecs } from "./webcodecs";
import { encodeWithMediaRecorder } from "./mediarec";
import { encodeWithFFmpeg } from "./ffmpeg";

export function getPreferredMimeType(): "video/webm" | "video/mp4" {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return isIOS ? "video/mp4" : "video/webm";
}

export async function encodeVideo(
  frames: cv.Mat[],
  fps: number,
): Promise<Blob> {
  const preferredMimeType = getPreferredMimeType();
  const alternativeMimeType =
    preferredMimeType === "video/webm" ? "video/mp4" : "video/webm";

  // 1. Try WebCodecs
  if (typeof window.VideoEncoder === "function") {
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
        const blob = await encodeWithWebCodecs(
          frames,
          fps,
          alternativeMimeType,
        );
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
  if (typeof window.MediaRecorder === "function") {
    try {
      const blob = await encodeWithMediaRecorder(
        frames,
        fps,
        preferredMimeType,
      );
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
