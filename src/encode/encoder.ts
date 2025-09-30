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
  const mimeType = getPreferredMimeType();

  // 1. Try WebCodecs
  if (typeof window.VideoEncoder === "function") {
    try {
      const blob = await encodeWithWebCodecs(frames, fps, mimeType);
      console.log(`Encoded with WebCodecs as ${mimeType}`);
      return blob;
    } catch (error) {
      console.warn("WebCodecs encoding failed, falling back...", error);
    }
  }

  // 2. Try MediaRecorder
  if (typeof window.MediaRecorder === "function") {
    try {
      const blob = await encodeWithMediaRecorder(frames, fps, mimeType);
      console.log(`Encoded with MediaRecorder as ${mimeType}`);
      return blob;
    } catch (error) {
      console.warn("MediaRecorder encoding failed, falling back...", error);
    }
  }

  // 3. Try ffmpeg.wasm
  try {
    const blob = await encodeWithFFmpeg(frames, fps, mimeType);
    console.log(`Encoded with ffmpeg.wasm as ${mimeType}`);
    return blob;
  } catch (error) {
    console.error("ffmpeg.wasm encoding failed.", error);
  }

  throw new Error("All video encoders failed.");
}
