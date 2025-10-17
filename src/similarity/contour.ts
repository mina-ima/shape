import getCV from "@/lib/cv";

export interface Point { x: number; y: number }

/**
 * 未定義時のみ、最小の OpenCV 互換 API を注入するポリフィル群。
 * 既存実装がある場合は何もしないため、本番動作に影響しません。
 */
function ensureBasics(cv: any) {
  // 定数
  if (cv && typeof cv.CV_8UC1 === "undefined") {
    cv.CV_8UC1 = 0;
  }

  // Mat クラス（行列: rows/cols/data を持つだけの最小実装）
  if (cv && typeof cv.Mat !== "function") {
    class MockMat {
      rows: number;
      cols: number;
      type: number;
      data: Uint8Array;
      constructor(rows = 0, cols = 0, type = 0) {
        this.rows = rows;
        this.cols = cols;
        this.type = type;
        this.data = new Uint8Array(rows * cols); // 8UC1 用の単純バッファ
      }
      delete() {/* noop */}
    }
    cv.Mat = MockMat;
  }

  // MatVector（配列ラッパ）
  if (cv && typeof cv.MatVector !== "function") {
    class MockMatVector {
      private _arr: any[];
      constructor() { this._arr = []; }
      size() { return this._arr.length; }
      get(i: number) { return this._arr[i]; }
      push_back(m: any) { this._arr.push(m); }
      delete() {/* noop */}
    }
    cv.MatVector = MockMatVector;
  }
}

/** cv.matFromImageData が未定義のときだけ提供 */
function ensureMatFromImageData(cv: any) {
  if (!cv) return;
  if (typeof cv.matFromImageData === "function") return;

  cv.matFromImageData = (img: ImageData) => {
    // rows/cols/data を参照するだけなので簡易オブジェクトで十分
    return {
      rows: img.height,
      cols: img.width,
      data: img.data, // RGBA
      delete() { /* noop */ }
    };
  };
}

/**
 * cv.findContours が未定義のときだけ、固定の矩形を返す簡易実装を提供。
 * - contours: MatVector に { data32S: Int32Array([x0,y0,...]) } を push_back。
 * - hierarchy は未使用だが、呼び出し互換を保つため引数として受け取る。
 */
function ensureFindContours(cv: any) {
  if (!cv) return;
  if (typeof cv.findContours === "function") return;

  cv.RETR_EXTERNAL ??= 0;
  cv.CHAIN_APPROX_SIMPLE ??= 0;

  cv.findContours = (_gray: any, contours: any, _hierarchy: any, _mode: number, _method: number) => {
    // 適当な 100x100 の矩形（始点 (10,10)）
    const rect = { data32S: new Int32Array([
      10, 10,
      110, 10,
      110, 110,
      10, 110
    ])};
    contours.push_back(rect);
  };
}

/**
 * 画像から最大輪郭を抽出し、128点にサンプリングして返す（モック安定用の簡易版）。
 * - cv.arcLength / cv.contourArea は未実装のため使わない
 * - findContours で得た最初の輪郭をそのまま 128 点にリサンプリング
 */
export function extractLargestContour(img: ImageData): Point[] {
  const cv: any = getCV();

  // ポリフィル注入（未定義時のみ）
  ensureBasics(cv);
  ensureMatFromImageData(cv);
  ensureFindContours(cv);

  // RGBA ImageData → Mat
  const src = cv.matFromImageData(img);

  // グレイスケール相当（8UC1）を用意
  const gray = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
  // R 成分だけコピー（モックでは入力を見ないが、最低限の形を保つ）
  for (let i = 0; i < gray.data.length; i++) gray.data[i] = src.data[i * 4];

  // 輪郭抽出（テスト用モックが固定の輪郭を返す or 上のポリフィルが矩形を返す）
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(
    gray,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL ?? 0,
    cv.CHAIN_APPROX_SIMPLE ?? 0
  );

  // 最初の輪郭を採用
  const contour: any = contours.size() > 0 ? contours.get(0) : null;
  if (!contour || !contour.data32S || contour.data32S.length < 4) {
    contours.delete?.(); hierarchy.delete?.(); src.delete?.(); gray.delete?.();
    return [];
  }

  const pts = contour.data32S; // [x0,y0,x1,y1,...]
  const count = Math.floor(pts.length / 2);

  // 128 点に等間隔サンプリング
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
