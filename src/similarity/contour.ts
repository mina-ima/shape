import cvPromise from "@techstark/opencv-js";
import cv from "@techstark/opencv-js";

export interface Point {
  x: number;
  y: number;
}

// Helper function to get a point at a specific distance along a contour
const getPointAtDistance = (
  cv: typeof import("@techstark/opencv-js"),
  contour: cv.Mat,
  distance: number,
): Point => {
  const perimeter = cv.arcLength(contour, true);
  if (distance > perimeter) distance = perimeter;
  if (distance < 0) distance = 0;

  let distanceSoFar = 0;
  const points = contour.data32S;

  for (let i = 0; i < points.length / 2 - 1; i++) {
    const p1 = { x: points[i * 2], y: points[i * 2 + 1] };
    const p2 = { x: points[(i + 1) * 2], y: points[(i + 1) * 2 + 1] };
    const segmentDistance = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2),
    );

    if (distanceSoFar + segmentDistance >= distance) {
      const remainingDistance = distance - distanceSoFar;
      const ratio = remainingDistance / segmentDistance;
      const newX = p1.x + (p2.x - p1.x) * ratio;
      const newY = p1.y + (p2.y - p1.y) * ratio;
      return { x: newX, y: newY };
    }
    distanceSoFar += segmentDistance;
  }

  // Fallback to the last point
  return { x: points[points.length - 2], y: points[points.length - 1] };
};

export async function extractLargestContour(mat: cv.Mat): Promise<Point[]> {
  const cvInstance = await cvPromise;
  const contours = new cvInstance.MatVector();
  const hierarchy = new cvInstance.Mat();

  cvInstance.findContours(
    mat,
    contours,
    hierarchy,
    cvInstance.RETR_EXTERNAL,
    cvInstance.CHAIN_APPROX_SIMPLE,
  );

  let largestContour: cv.Mat | null = null;
  let maxArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cvInstance.contourArea(contour);
    if (area > maxArea) {
      maxArea = area;
      largestContour = contour;
    }
  }

  if (!largestContour) {
    return [];
  }

  const sampledPoints: Point[] = [];
  const perimeter = cvInstance.arcLength(largestContour, true);
  for (let i = 0; i < 128; i++) {
    const distance = (i / 128) * perimeter;
    const pointOnContour = getPointAtDistance(
      cvInstance,
      largestContour,
      distance,
    );
    sampledPoints.push({ x: pointOnContour.x, y: pointOnContour.y });
  }

  contours.delete();
  hierarchy.delete();

  return sampledPoints;
}
