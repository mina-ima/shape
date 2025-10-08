import cv from "@techstark/opencv-js";

export function expandAndBlurBackground(
  cvInstance: typeof cv,
  backgroundImage: cv.Mat,
  scaleFactor: number,
  blurKernelSize: number,
): cv.Mat {
  const originalWidth = backgroundImage.cols;
  const originalHeight = backgroundImage.rows;

  const newWidth = Math.round(originalWidth * scaleFactor);
  const newHeight = Math.round(originalHeight * scaleFactor);

  const expandedBg = new cvInstance.Mat(
    newHeight,
    newWidth,
    backgroundImage.type(),
  );
  const dsize = new cvInstance.Size(newWidth, newHeight);
  cvInstance.resize(
    backgroundImage,
    expandedBg,
    dsize,
    0,
    0,
    cvInstance.INTER_LINEAR,
  );

  const blurredBg = new cvInstance.Mat();
  const ksize = new cvInstance.Size(blurKernelSize, blurKernelSize);
  cvInstance.GaussianBlur(
    expandedBg,
    blurredBg,
    ksize,
    0,
    0,
    cvInstance.BORDER_DEFAULT,
  );

  expandedBg.delete();

  return blurredBg;
}
