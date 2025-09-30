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

export function animateParallax(
  foregroundElement: HTMLElement,
  backgroundElement: HTMLElement,
  durationSeconds: number,
  easing: string, // e.g., 'easeInOutSine'
  crossfadeDurationSeconds: number = 0, // Optional for MVP
) {
  const durationMs = durationSeconds * 1000;
  const panAmount = 20; // pixels to pan
  const fgScale = 1.05;
  const bgScale = 1.15;

  let startTime: number | null = null;

  const animate = (currentTime: number) => {
    if (!startTime) startTime = currentTime;
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / durationMs, 1);

    // Apply easing function (simple linear for now, will replace with actual easing)
    let easedProgress = progress;
    // TODO: Implement actual easing function based on 'easing' parameter

    // Foreground animation: pan right to left, smaller scale
    const fgTranslateX = panAmount * (1 - easedProgress);
    foregroundElement.style.transform = `translateX(${fgTranslateX}px) scale(${fgScale})`;

    // Background animation: pan left to right, larger scale
    const bgTranslateX = -panAmount * (1 - easedProgress);
    backgroundElement.style.transform = `translateX(${bgTranslateX}px) scale(${bgScale})`;

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // Loop or handle crossfade
      // TODO: Implement looping and crossfade
    }
  };

  requestAnimationFrame(animate);
}
