import cv from "@techstark/opencv-js";

export async function encodeWithWebCodecs(
  _frames: cv.Mat[],
  _fps: number,
  _mimeType: string,
): Promise<Blob> {
  // This is a placeholder and will be implemented.
  throw new Error("WebCodecs not available");
}
