import cv from "@techstark/opencv-js";

export async function encodeWithMediaRecorder(
  frames: cv.Mat[],
  fps: number,
  mimeType: string,
): Promise<Blob> {
  if (typeof window.MediaRecorder !== "function") {
    throw new Error("MediaRecorder is not available.");
  }

  if (frames.length === 0) {
    return new Blob([], { type: mimeType });
  }

  const width = frames[0].cols;
  const height = frames[0].rows;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return reject(new Error("Could not get 2D context from canvas."));
    }

    const stream = canvas.captureStream(fps); // Capture stream at desired FPS
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    mediaRecorder.onerror = (event) => {
      reject(event.error);
    };

    mediaRecorder.start();

    let frameIndex = 0;
    const drawFrame = () => {
      if (frameIndex < frames.length) {
        const frame = frames[frameIndex];
        // Convert OpenCV Mat to ImageData for drawing on canvas
        const imageData = new ImageData(
          new Uint8ClampedArray(frame.data),
          frame.cols,
          frame.rows,
        );
        ctx.putImageData(imageData, 0, 0);
        frameIndex++;
        requestAnimationFrame(drawFrame);
      } else {
        mediaRecorder.stop();
      }
    };

    requestAnimationFrame(drawFrame);
  });
}
