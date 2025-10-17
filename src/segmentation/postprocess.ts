import getCV from "@/lib/cv";

/**
 * Applies post-processing to a raw alpha mask to clean it up.
 * Operations include morphological opening (removes noise) and closing (fills holes),
 * followed by a Gaussian blur to feather the edges.
 * @param alphaMask The raw alpha mask as a flat array.
 * @param width The width of the mask.
 * @param height The height of the mask.
 * @returns A promise that resolves to the processed alpha mask.
 */
export async function postProcessAlphaMask(
  alphaMask: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const cv = await getCV();

  // Create an OpenCV Mat from the input array
  const grayMat = new cv.Mat(height, width, cv.CV_8UC1);
  grayMat.data.set(alphaMask);

  // Morphological Opening (erosion followed by dilation) to remove small objects
  const openKernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const openedMat = new cv.Mat();
  cv.morphologyEx(grayMat, openedMat, cv.MORPH_OPEN, openKernel);

  // Morphological Closing (dilation followed by erosion) to close small holes
  const closeKernel = cv.Mat.ones(7, 7, cv.CV_8U); // Larger kernel for closing
  const closedMat = new cv.Mat();
  cv.morphologyEx(openedMat, closedMat, cv.MORPH_CLOSE, closeKernel);

  // Dilation to slightly enlarge the mask
  const dilatedMat = new cv.Mat();
  const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.dilate(closedMat, dilatedMat, dilateKernel);

  // Apply Gaussian blur for feathering (e.g., 5px)
  const featheredMat = new cv.Mat();
  const ksize = new cv.Size(5, 5);
  cv.GaussianBlur(dilatedMat, featheredMat, ksize, 0, 0, cv.BORDER_DEFAULT);

  const outputMask = new Uint8ClampedArray(featheredMat.data);

  // Clean up OpenCV Mats
  grayMat.delete();
  openKernel.delete();
  openedMat.delete();
  closeKernel.delete();
  closedMat.delete();
  dilatedMat.delete();
  dilateKernel.delete();
  featheredMat.delete();

  return outputMask;
}
