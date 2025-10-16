import getCV from "@/lib/cv";

export interface Point { x: number; y: number }

/**
 * 画像から最大輪郭を抽出し、128点にサンプリングして返す（モック安定用の簡易版）。
 * - cv.arcLength / cv.contourArea は未実装のため使わない
 * - findContours で得た最初の輪郭をそのまま 128 点にリサンプリング
 */
export function extractLargestContour(img: ImageData): Point[] {
  const cv = getCV();

  // RGBA ImageData → Mat
  const src = cv.matFromImageData(img);

  // グレイスケール相当が必要な場面でも、モックでは findContours が入力を見ないためそのままでもOK
  // 形式だけ 8UC1 にしておく
  const gray = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
  for (let i = 0; i < gray.data.length; i++) gray.data[i] = src.data[i * 4]; // R 成分をコピー

  // 輪郭抽出（モックは固定の四角を返す）
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL ?? 0, cv.CHAIN_APPROX_SIMPLE ?? 0);

  // 最初の輪郭を採用（モックは 1 つ）
  const contour: any = contours.size() > 0 ? contours.get(0) : null;
  if (!contour || !contour.data32S || contour.data32S.length < 4) {
    contours.delete?.(); hierarchy.delete?.(); src.delete?.(); gray.delete?.();
    return [];
  }

  const pts = contour.data32S; // [x0,y0,x1,y1,...]
  const count = Math.floor(pts.length / 2);

  // 128 点に等間隔サンプリング（インデックスベース。弧長は使わない）
  const SAMPLES = 128;
  const sampled: Point[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const idx = Math.floor((i / SAMPLES) * count) % count;
    sampled.push({ x: pts[idx * 2], y: pts[idx * 2 + 1] });
  }

  contours.delete?.();
  hierarchy.delete?.();
  src.delete?.();
  gray.delete?.();

  return sampled;
}
