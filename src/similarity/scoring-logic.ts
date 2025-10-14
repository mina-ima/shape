import cv from "@techstark/opencv-js";
import { extractLargestContour } from "./contour";
import { calculateHuMoments, calculateEFD } from "./descriptors";

// Helper to convert ImageData to OpenCV Mat
const imageDataToMat = (
  cvInstance: typeof cv,
  imageData: ImageData,
): cv.Mat => {
  return cvInstance.matFromImageData(imageData);
};

// Helper to convert mask ImageData to a single-channel Mat for contour extraction
const maskImageDataToMat = (
  cvInstance: typeof cv,
  maskData: ImageData,
): cv.Mat => {
  const mat = cvInstance.matFromImageData(maskData);
  const grayMat = new cv.Mat();
  cvInstance.cvtColor(mat, grayMat, cvInstance.COLOR_RGBA2GRAY);
  mat.delete();
  return grayMat;
};

// Helper for cosine similarity
const cosineSimilarity = (vec1: number[], vec2: number[]): number => {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
  if (magnitude1 === 0 || magnitude2 === 0) return 0; // Avoid division by zero
  return dotProduct / (magnitude1 * magnitude2);
};

// Helper for Euclidean distance (norm)
const euclideanDistance = (vec1: number[], vec2: number[]): number => {
  const sumOfSquares = vec1.reduce(
    (sum, val, i) => sum + Math.pow(val - vec2[i], 2),
    0,
  );
  return Math.sqrt(sumOfSquares);
};

export async function performSimilarityCalculation(
  cvInstance: typeof cv,
  foregroundImage: ImageData,
  backgroundImage: ImageData,
  foregroundMask: ImageData,
): Promise<number> {
  // Convert ImageData to Mat
  const fgMat = imageDataToMat(cvInstance, foregroundImage);
  const bgMat = imageDataToMat(cvInstance, backgroundImage);
  const fgMaskMat = maskImageDataToMat(cvInstance, foregroundMask);

  // Apply Canny edge detection
  const fgCanny = new cvInstance.Mat();
  const bgCanny = new cvInstance.Mat();
  cvInstance.Canny(fgMat, fgCanny, 50, 100);
  cvInstance.Canny(bgMat, bgCanny, 50, 100);

  // Extract largest contours
  const fgContourPoints = await extractLargestContour(cvInstance, fgCanny);
  const bgContourPoints = await extractLargestContour(cvInstance, bgCanny);

  if (fgContourPoints.length === 0 || bgContourPoints.length === 0) {
    // Clean up and return 0 if no contours found
    fgMat.delete();
    bgMat.delete();
    fgMaskMat.delete();
    fgCanny.delete();
    bgCanny.delete();
    return 0;
  }

  // Convert contour points back to cv.Mat for Hu Moments and EFD
  const fgContourMat = cvInstance.matFromArray(
    fgContourPoints.length,
    1,
    cvInstance.CV_32SC2,
    fgContourPoints.flatMap((p) => [p.x, p.y]),
  );
  const bgContourMat = cvInstance.matFromArray(
    bgContourPoints.length,
    1,
    cvInstance.CV_32SC2,
    bgContourPoints.flatMap((p) => [p.x, p.y]),
  );

  // Calculate Hu Moments
  const fgHuMoments = calculateHuMoments(cvInstance, fgContourMat);
  const bgHuMoments = calculateHuMoments(cvInstance, bgContourMat);

  // Calculate EFD (using 10 harmonics as an example)
  const numHarmonics = 10;
  const fgEFD = calculateEFD(cvInstance, fgContourMat, numHarmonics);
  const bgEFD = calculateEFD(cvInstance, bgContourMat, numHarmonics);

  // Calculate scores
  const w1 = 0.7; // Weight for EFD (shape similarity)
  const w2 = 0.3; // Weight for Hu Moments (global shape characteristics)

  const efdSimilarity = cosineSimilarity(fgEFD, bgEFD);
  const huMomentDistance = euclideanDistance(fgHuMoments, bgHuMoments);

  const normalizedHuDistance = 1 / (1 + huMomentDistance);

  const score = w1 * efdSimilarity + w2 * normalizedHuDistance;

  // Clean up OpenCV Mats
  fgMat.delete();
  bgMat.delete();
  fgMaskMat.delete();
  fgCanny.delete();
  bgCanny.delete();
  fgContourMat.delete();
  bgContourMat.delete();

  return score;
}
