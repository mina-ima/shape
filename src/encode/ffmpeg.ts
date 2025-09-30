import cv from "@techstark/opencv-js";

export async function encodeWithFFmpeg(
  _frames: cv.Mat[],
  _fps: number,
  _mimeType: string,
): Promise<Blob> {
  // This is a placeholder and will be implemented.
  throw new Error("ffmpeg.wasm not available");
}
