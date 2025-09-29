import { Tensor } from "onnxruntime-web";
// The imported 'cv' is a promise-like object that resolves to the cv instance.
import cvPromise from "@techstark/opencv-js";

export async function postProcessAlphaMask(alphaMask: Tensor): Promise<Tensor> {
  // Await the promise to get the initialized cv instance
  const cv = await cvPromise;

  const width = alphaMask.dims[3];
  const height = alphaMask.dims[2];

  // Create an OpenCV Mat from the input Tensor data
  // Assuming alphaMask is a 1x1xHxW tensor (grayscale)
  const mat = new cv.Mat(height, width, cv.CV_32F);
  mat.data32F.set(alphaMask.data as Float32Array);

  // Convert to 8-bit grayscale for morphological operations
  const grayMat = new cv.Mat();
  mat.convertTo(grayMat, cv.CV_8U, 255);

  // Morphological Opening (erosion followed by dilation) to remove small objects and smooth contours
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const openedMat = new cv.Mat();
  cv.morphologyEx(grayMat, openedMat, cv.MORPH_OPEN, kernel);

  // Morphological Closing (dilation followed by erosion) to close small holes inside foreground objects
  const closedMat = new cv.Mat();
  cv.morphologyEx(openedMat, closedMat, cv.MORPH_CLOSE, kernel);

  // Apply Gaussian blur for feathering (3-5px)
  const featheredMat = new cv.Mat();
  const ksize = new cv.Size(5, 5); // 5x5 kernel for 5px feathering
  cv.GaussianBlur(closedMat, featheredMat, ksize, 0, 0, cv.BORDER_DEFAULT);

  // Convert back to Float32 and normalize to [0, 1]
  const outputMat = new cv.Mat();
  featheredMat.convertTo(outputMat, cv.CV_32F, 1 / 255);

  // Create a new Tensor from the processed Mat data
  const outputData = new Float32Array(outputMat.data32F);
  const outputTensor = new Tensor("float32", outputData, alphaMask.dims);

  // Clean up OpenCV Mats
  mat.delete();
  grayMat.delete();
  kernel.delete();
  openedMat.delete();
  closedMat.delete();
  featheredMat.delete();
  outputMat.delete();

  return outputTensor;
}
