import cv from "@techstark/opencv-js";

export async function encodeWithFFmpeg(
  _frames: cv.Mat[],
  _fps: number,
  mimeType: string,
): Promise<Blob> {
  // Simulate ffmpeg.wasm processing time
  await new Promise((resolve) => setTimeout(resolve, 10000)); // Simulate 10 seconds of processing

  // Return a dummy blob for now
  return new Blob(["ffmpeg_encoded_video"], { type: mimeType });
}
