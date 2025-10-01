import { calculateHuMoments, calculateEFD } from "./descriptors";
import { extractLargestContour } from "./contour";
import cvPromise from "@techstark/opencv-js";

// Helper for cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0; // Avoid division by zero

  return dotProduct / (magnitudeA * magnitudeB);
}

// Helper for L2 norm (Euclidean distance)
function euclideanDistance(vecA: number[], vecB: number[]): number {
  let sumOfSquares = 0;
  for (let i = 0; i < vecA.length; i++) {
    sumOfSquares += Math.pow(vecA[i] - vecB[i], 2);
  }
  return Math.sqrt(sumOfSquares);
}

// Normalization for Hu Moments (log transform is common)
function normalizeHuMoments(huMoments: number[]): number[] {
  return huMoments.map((m) => -Math.sign(m) * Math.log(Math.abs(m)));
}

export async function calculateSimilarityScore(
  foregroundImage: ImageData,
  backgroundImage: ImageData,
  foregroundMask: ImageData, // Alpha mask for foreground
): Promise<number> {
  const cv = await cvPromise;

  // 1. Process Foreground
  const fgMat = cv.matFromImageData(foregroundImage);
  const fgMaskMat = cv.matFromImageData(foregroundMask);

  // Convert mask to grayscale for contour extraction
  const fgMaskGray = new cv.Mat();
  cv.cvtColor(fgMaskMat, fgMaskGray, cv.COLOR_RGBA2GRAY, 0);

  // Apply Canny edge detection to the mask
  const fgEdges = new cv.Mat();
  cv.Canny(fgMaskGray, fgEdges, 50, 150, 3, false);

  const fgContourPoints = await extractLargestContour(fgEdges);
  const fgContour = new cv.Mat(fgContourPoints.length, 1, cv.CV_32SC2);
  for (let i = 0; i < fgContourPoints.length; ++i) {
    fgContour.data32S[i * 2] = fgContourPoints[i].x;
    fgContour.data32S[i * 2 + 1] = fgContourPoints[i].y;
  }

  const fgHuMoments = normalizeHuMoments(calculateHuMoments(cv, fgContour));
  const fgEFD = calculateEFD(cv, fgContour, 10); // Use 10 harmonics for EFD

  fgMat.delete();
  fgMaskMat.delete();
  fgMaskGray.delete();
  fgEdges.delete();
  fgContour.delete();

  // 2. Process Background (simplified: assume it's a full image, extract its main features)
  // For background, we might want to extract features from the entire image or dominant objects.
  // A more sophisticated approach would involve segmenting the background too.
  const bgMat = cv.matFromImageData(backgroundImage);
  const bgGray = new cv.Mat();
  cv.cvtColor(bgMat, bgGray, cv.COLOR_RGBA2GRAY, 0);

  const bgEdges = new cv.Mat();
  cv.Canny(bgGray, bgEdges, 50, 150, 3, false);

  const bgContourPoints = await extractLargestContour(bgEdges);
  const bgContour = new cv.Mat(bgContourPoints.length, 1, cv.CV_32SC2);
  for (let i = 0; i < bgContourPoints.length; ++i) {
    bgContour.data32S[i * 2] = bgContourPoints[i].x;
    bgContour.data32S[i * 2 + 1] = bgContourPoints[i].y;
  }

  const bgHuMoments = normalizeHuMoments(calculateHuMoments(cv, bgContour));
  const bgEFD = calculateEFD(cv, bgContour, 10);

  bgMat.delete();
  bgGray.delete();
  bgEdges.delete();
  bgContour.delete();

  // 3. Calculate Score
  const w1 = 0.7; // Weight for EFD (shape similarity)
  const w2 = 0.3; // Weight for Hu Moments (invariant moments)

  const efdSimilarity = cosineSimilarity(fgEFD, bgEFD);
  const huMomentDistance = euclideanDistance(fgHuMoments, bgHuMoments);
  const huMomentSimilarity =
    1 - huMomentDistance / (Math.sqrt(fgHuMoments.length) * 2); // Normalize distance to 0-1 range

  const score = w1 * efdSimilarity + w2 * huMomentSimilarity;

  return score;
}
