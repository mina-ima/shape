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

  const r = rgbaPlanes.get(0);
  const g = rgbaPlanes.get(1);
  const b = rgbaPlanes.get(2);
  const newRgbaPlanes = new cv.MatVector();
  newRgbaPlanes.push_back(r);
  newRgbaPlanes.push_back(g);
  newRgbaPlanes.push_back(b);
  newRgbaPlanes.push_back(alphaMask8UC1);
  cv.merge(newRgbaPlanes, foreground);
  r.delete();
  g.delete();
  b.delete();
  newRgbaPlanes.delete();

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
  foregroundLayer: cv.Mat, // RGBA
  backgroundLayer: cv.Mat, // RGB
  width: number,
  height: number,
  duration: number,
  fps: number,
  crossfadeDuration: number = 0,
): Promise<cv.Mat[]> {
  const totalFrames = Math.floor(duration * fps);
  const frames: cv.Mat[] = [];

  const panAmount = 20; // pixels
  const fgScale = 1.05;
  const bgScale = 1.15;

  const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

  // Pre-scale layers to avoid resampling in the loop and create padding
  const fgPadded = new cv.Mat();
  const bgPadded = new cv.Mat();
  cv.resize(
    foregroundLayer,
    fgPadded,
    new cv.Size(Math.round(width * fgScale), Math.round(height * fgScale)),
    0,
    0,
    cv.INTER_LINEAR,
  );
  cv.resize(
    backgroundLayer,
    bgPadded,
    new cv.Size(Math.round(width * bgScale), Math.round(height * bgScale)),
    0,
    0,
    cv.INTER_LINEAR,
  );

  const bgPaddedRgba = new cv.Mat();
  cv.cvtColor(bgPadded, bgPaddedRgba, cv.COLOR_RGB2RGBA);

  const crossfadeFrames = Math.floor(crossfadeDuration * fps);

  for (let i = 0; i < totalFrames; i++) {
    const progress = totalFrames > 1 ? i / (totalFrames - 1) : 0;
    const easedProgress = easeInOutSine(progress);

    // Calculate translation for this frame
    const fgTranslateX =
      panAmount * (1 - easedProgress) - (fgPadded.cols - width) / 2;
    const fgTranslateY = -(fgPadded.rows - height) / 2;
    const bgTranslateX =
      -panAmount * (1 - easedProgress) - (bgPadded.cols - width) / 2;
    const bgTranslateY = -(bgPadded.rows - height) / 2;

    // Create transformation matrices
    const fgM = cv.matFromArray(2, 3, cv.CV_64F, [
      1,
      0,
      fgTranslateX,
      0,
      1,
      fgTranslateY,
    ]);
    const bgM = cv.matFromArray(2, 3, cv.CV_64F, [
      1,
      0,
      bgTranslateX,
      0,
      1,
      bgTranslateY,
    ]);

    // Warp the padded layers
    const warpedFg = new cv.Mat();
    const warpedBgRgba = new cv.Mat();
    const dsize = new cv.Size(width, height);
    cv.warpAffine(
      fgPadded,
      warpedFg,
      fgM,
      dsize,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(),
    );
    cv.warpAffine(
      bgPaddedRgba,
      warpedBgRgba,
      bgM,
      dsize,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(),
    );

    // Composite BG and FG
    const fgPlanes = new cv.MatVector();
    cv.split(warpedFg, fgPlanes);
    const fgAlphaMask = fgPlanes.get(3);
    warpedFg.copyTo(warpedBgRgba, fgAlphaMask);

    // Handle crossfade by adjusting the alpha channel of the entire frame
    let fadeAlpha = 1.0;
    if (crossfadeFrames > 0) {
      if (i < crossfadeFrames) {
        fadeAlpha = i / crossfadeFrames;
      } else if (i >= totalFrames - crossfadeFrames) {
        fadeAlpha = (totalFrames - 1 - i) / crossfadeFrames;
      }
    }

    if (fadeAlpha < 1.0) {
      const framePlanes = new cv.MatVector();
      cv.split(warpedBgRgba, framePlanes);
      const frameAlpha = framePlanes.get(3);
      frameAlpha.convertTo(frameAlpha, cv.CV_8U, fadeAlpha);

      const r = framePlanes.get(0);
      const g = framePlanes.get(1);
      const b = framePlanes.get(2);
      const newFramePlanes = new cv.MatVector();
      newFramePlanes.push_back(r);
      newFramePlanes.push_back(g);
      newFramePlanes.push_back(b);
      newFramePlanes.push_back(frameAlpha);
      cv.merge(newFramePlanes, warpedBgRgba);

      r.delete();
      g.delete();
      b.delete();
      newFramePlanes.delete();
      framePlanes.delete();
      frameAlpha.delete();
    }

    frames.push(warpedBgRgba);

    // Cleanup per-frame mats
    fgM.delete();
    bgM.delete();
    warpedFg.delete();
    fgAlphaMask.delete();
    fgPlanes.delete();
  }

  // Final cleanup
  fgPadded.delete();
  bgPadded.delete();
  bgPaddedRgba.delete();

  return frames;
}

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function animateParallax(
  foregroundElement: HTMLElement,
  backgroundElement: HTMLElement,
  durationSeconds: number,
  easing: string, // e.g., 'easeInOutSine'
  crossfadeDurationSeconds: number = 0, // Optional for MVP
) {
  const durationMs = durationSeconds * 1000;
  const crossfadeDurationMs = crossfadeDurationSeconds * 1000;
  const panAmount = 20; // pixels to pan
  const fgScale = 1.05;
  const bgScale = 1.15;

  if (crossfadeDurationSeconds > 0) {
    foregroundElement.style.opacity = "0";
    backgroundElement.style.opacity = "0";
  } else {
    foregroundElement.style.opacity = "1";
    backgroundElement.style.opacity = "1";
  }

  let startTime: number | null = null;

  const animate = (currentTime: number) => {
    if (startTime === null) {
      startTime = currentTime;
    }
    const elapsedTime = currentTime - startTime;

    const progress = (elapsedTime % durationMs) / durationMs;
    const easedProgress = easeInOutSine(progress);

    // Foreground animation: pan right to left, smaller scale
    const fgTranslateX = panAmount * (1 - easedProgress);
    foregroundElement.style.transform = `translateX(${fgTranslateX}px) scale(${fgScale})`;

    // Background animation: pan left to right, larger scale
    const bgTranslateX = -panAmount * (1 - easedProgress);
    backgroundElement.style.transform = `translateX(${bgTranslateX}px) scale(${bgScale})`;

    // Crossfade logic (simple for MVP)
    if (crossfadeDurationSeconds > 0) {
      if (progress > (durationMs - crossfadeDurationMs) / durationMs) {
        const fadeProgress =
          (elapsedTime - (durationMs - crossfadeDurationMs)) /
          crossfadeDurationMs;
        foregroundElement.style.opacity = `${1 - fadeProgress}`;
        backgroundElement.style.opacity = `${1 - fadeProgress}`;
      } else if (progress < crossfadeDurationMs / durationMs) {
        const fadeProgress = elapsedTime / crossfadeDurationMs;
        foregroundElement.style.opacity = `${fadeProgress}`;
        backgroundElement.style.opacity = `${fadeProgress}`;
      } else {
        foregroundElement.style.opacity = "1";
        backgroundElement.style.opacity = "1";
      }
    }

    requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);
}
