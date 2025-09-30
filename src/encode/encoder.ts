import cv from "@techstark/opencv-js";
import { encodeWithWebCodecs } from "./webcodecs";
import { encodeWithMediaRecorder } from "./mediarec";
import { encodeWithFFmpeg } from "./ffmpeg";

export async function encodeVideo(
  frames: cv.Mat[],
  fps: number,
): Promise<Blob> {
  // 1. Try WebCodecs
  if (typeof window.VideoEncoder === "function") {
    try {
      const blob = await encodeWithWebCodecs(frames, fps);
      console.log("Encoded with WebCodecs");
      return blob;
    } catch (error) {
      console.warn("WebCodecs encoding failed, falling back...", error);
    }
  }

  // 2. Try MediaRecorder
  if (typeof window.MediaRecorder === "function") {
    try {
      const blob = await encodeWithMediaRecorder(frames, fps);
      console.log("Encoded with MediaRecorder");
      return blob;
    } catch (error) {
      console.warn("MediaRecorder encoding failed, falling back...", error);
    }
  }

  // 3. Try ffmpeg.wasm
  try {
    const blob = await encodeWithFFmpeg(frames, fps);
    console.log("Encoded with ffmpeg.wasm");
    return blob;
  } catch (error) {
    console.error("ffmpeg.wasm encoding failed.", error);
  }

  throw new Error("All video encoders failed.");
}
