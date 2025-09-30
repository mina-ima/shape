import cv from "@techstark/opencv-js";

export async function generateLayers(
  cv: typeof import("@techstark/opencv-js"),
  originalImage: cv.Mat,
  alphaMask: cv.Mat,
  backgroundImage: cv.Mat,
): Promise<{ foreground: cv.Mat; background: cv.Mat }> {
  // Convert original image to RGBA if not already
  const originalImageRGBA = new cv.Mat();
  if (originalImage.channels() === 3) {
    cv.cvtColor(originalImage, originalImageRGBA, cv.COLOR_RGB2RGBA);
  } else {
    originalImage.copyTo(originalImageRGBA);
  }

  // Ensure alphaMask is 8UC1
  const alphaMask8UC1 = new cv.Mat();
  if (alphaMask.type() !== cv.CV_8UC1) {
    alphaMask.convertTo(alphaMask8UC1, cv.CV_8UC1, 255);
  } else {
    alphaMask.copyTo(alphaMask8UC1);
  }

  // Create foreground with alpha channel
  const foreground = new cv.Mat(
    originalImageRGBA.rows,
    originalImageRGBA.cols,
    cv.CV_8UC4,
  );
  const rgbaPlanes = new cv.MatVector();
  cv.split(originalImageRGBA, rgbaPlanes);
  rgbaPlanes.set(3, alphaMask8UC1);
  cv.merge(rgbaPlanes, foreground);

  rgbaPlanes.delete();

  // Background is simply the provided background image
  const background = new cv.Mat();
  backgroundImage.copyTo(background);

  originalImageRGBA.delete();
  alphaMask8UC1.delete();

  return { foreground, background };
}

export async function generateParallaxFrames(
  cv: typeof import("@techstark/opencv-js"),
  foregroundLayer: cv.Mat,
  backgroundLayer: cv.Mat,
  width: number,
  height: number,
  duration: number,
  fps: number,
): Promise<cv.Mat[]> {
  // Placeholder for actual parallax frame generation
  // This will be implemented in a later step
  const totalFrames = duration * fps;
  const frames: cv.Mat[] = [];
  for (let i = 0; i < totalFrames; i++) {
    // For now, just return copies of the foreground layer
    const frame = new cv.Mat();
    foregroundLayer.copyTo(frame);
    frames.push(frame);
  }
  return frames;
}
