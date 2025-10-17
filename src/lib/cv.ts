/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 軽量なCV互換実装（テスト安定化用）
 * - default export は「getCV()」関数（Promiseを返す）に変更
 * - 既存の `await getCV()` は `await getCV()()` に置き換え不要（→ そのまま `await getCV()` でOK）
 * - 直接オブジェクトが必要な場合は named export の `cv` を使用可能
 */

class Mat {
  rows: number;
  cols: number;
  private _type: number;
  private _channels: number;
  _data: Uint8Array | Int32Array | Float64Array;

  constructor(rows = 0, cols = 0, type = 4, data?: ArrayLike<number>) {
    this.rows = rows;
    this.cols = cols;
    this._type = type;
    this._channels =
      type === 0 /* CV_8UC1 */ ? 1 :
      type === 0x2002 /* CV_32SC2 */ ? 2 :
      type === 3 /* CV_8UC3 */ ? 3 :
      type === 6 /* CV_64FC1/CV_64F */ ? 1 :
      4; // default RGBA

    const size = Math.max(1, rows * cols * this._channels);

    if (type === 6) {
      this._data = new Float64Array(size);
    } else if (type === 0x2002) {
      this._data = new Int32Array(size);
    } else {
      this._data = new Uint8Array(size);
    }

    if (data) (this._data as any).set(data);
  }

  type() { return this._type; }
  channels() { return this._channels; }

  get data() { return this._data as Uint8Array; }
  get data32S() { return this._data as Int32Array; }
  get data64F() { return this._data as Float64Array; }

  ptr(row: number, col: number) {
    const idx = (row * this.cols + col) * this._channels;
    return (this._data as any).subarray(idx, idx + this._channels);
  }

  copyTo(dst: Mat, mask?: Mat) {
    dst.rows = this.rows;
    dst.cols = this.cols;
    dst._type = this._type;
    dst._channels = this._channels;
    dst._data = new ((this._data as any).constructor)(this._data);

    if (mask) {
      const pix = this.rows * this.cols;
      for (let i = 0; i < pix; i++) {
        const m = (mask._data as any)[i] ?? 255;
        if (m === 0) {
          for (let c = 0; c < this._channels; c++) {
            (dst._data as any)[i * this._channels + c] = 0;
          }
        }
      }
    }
  }

  convertTo(dst: Mat, type: number, alpha = 1, beta = 0) {
    dst.rows = this.rows;
    dst.cols = this.cols;
    dst._type = type;
    dst._channels = this._channels;

    const Ctor =
      type === 6 ? Float64Array :
      (this._data as any).constructor;

    dst._data = new (Ctor as any)((this._data as any).length);
    for (let i = 0; i < (this._data as any).length; i++) {
      (dst._data as any)[i] = (this._data as any)[i] * alpha + beta;
    }
  }

  delete() {
    this.rows = 0;
    this.cols = 0;
    this._type = 0;
    this._channels = 0;
    this._data = new Uint8Array(0);
  }
}

class MatVector {
  private arr: Mat[] = [];
  push_back(m: Mat) { this.arr.push(m); }
  get(i: number) { return this.arr[i]; }
  size() { return this.arr.length; }
  delete() { this.arr.length = 0; }
}

class Point {
  constructor(public x: number, public y: number) {}
}
class Size {
  constructor(public width: number, public height: number) {}
}
class Scalar extends Array<number> {
  constructor(...v: number[]) { super(...v); }
}

// 定数
const CV_8UC1 = 0;
const CV_8UC3 = 3;
const CV_8UC4 = 4;
const CV_32SC2 = 0x2002;
const CV_32FC1 = 5;
const CV_64FC1 = 6;
const CV_64F = 6;

const INTER_LINEAR = 1;
const BORDER_CONSTANT = 0;

const COLOR_RGBA2RGB = 1;
const COLOR_RGB2RGBA = 2;
const COLOR_GRAY2RGB = 7;
const COLOR_GRAY2RGBA = 8;
// ★ 追加: RGBA/RGB → GRAY
const COLOR_RGBA2GRAY = 9;
const COLOR_RGB2GRAY = 10;

// ユーティリティ
const matFromImageData = (imageData: ImageData) =>
  new Mat(imageData.height, imageData.width, CV_8UC4, imageData.data as any);

const matFromArray = (rows: number, cols: number, type: number, arr: number[]) =>
  new Mat(rows, cols, type, arr);

// 主要API（省略版でOK）
const cvtColor = (src: Mat, dst: Mat, code: number) => {
  if (code === COLOR_RGBA2RGB) {
    const ch = 3;
    dst.rows = src.rows; dst.cols = src.cols;
    (dst as any)._type = CV_8UC3;
    (dst as any)._channels = ch;
    dst._data = new Uint8Array(src.rows * src.cols * ch);
    for (let i = 0, j = 0; i < (src.data as any).length; i += 4, j += 3) {
      (dst.data as any)[j] = (src.data as any)[i];
      (dst.data as any)[j + 1] = (src.data as any)[i + 1];
      (dst.data as any)[j + 2] = (src.data as any)[i + 2];
    }
    return;
  }
  if (code === COLOR_RGB2RGBA) {
    const ch = 4;
    dst.rows = src.rows; dst.cols = src.cols;
    (dst as any)._type = CV_8UC4;
    (dst as any)._channels = ch;
    dst._data = new Uint8Array(src.rows * src.cols * ch);
    for (let i = 0, j = 0; i < (src.data as any).length; i += 3, j += 4) {
      (dst.data as any)[j] = (src.data as any)[i];
      (dst.data as any)[j + 1] = (src.data as any)[i + 1];
      (dst.data as any)[j + 2] = (src.data as any)[i + 2];
      (dst.data as any)[j + 3] = 255;
    }
    return;
  }
  if (code === COLOR_GRAY2RGB || code === COLOR_GRAY2RGBA) {
    const ch = code === COLOR_GRAY2RGBA ? 4 : 3;
    dst.rows = src.rows; dst.cols = src.cols;
    (dst as any)._type = ch === 4 ? CV_8UC4 : CV_8UC3;
    (dst as any)._channels = ch;
    dst._data = new Uint8Array(src.rows * src.cols * ch);
    for (let i = 0, j = 0; i < (src.data as any).length; i += 1, j += ch) {
      const v = (src.data as any)[i];
      (dst.data as any)[j] = v;
      (dst.data as any)[j + 1] = v;
      (dst.data as any)[j + 2] = v;
      if (ch === 4) (dst.data as any)[j + 3] = 255;
    }
    return;
  }
  // ★ 追加: RGBA/RGB → GRAY（単純平均）
  if (code === COLOR_RGBA2GRAY || code === COLOR_RGB2GRAY) {
    const srcCh = src.channels();
    const ch = 1;
    dst.rows = src.rows; dst.cols = src.cols;
    (dst as any)._type = CV_8UC1;
    (dst as any)._channels = ch;
    dst._data = new Uint8Array(src.rows * src.cols * ch);
    if (srcCh === 4) {
      for (let i = 0, j = 0; i < (src.data as any).length; i += 4, j += 1) {
        const r = (src.data as any)[i];
        const g = (src.data as any)[i + 1];
        const b = (src.data as any)[i + 2];
        (dst.data as any)[j] = ((r + g + b) / 3) | 0;
      }
    } else if (srcCh === 3) {
      for (let i = 0, j = 0; i < (src.data as any).length; i += 3, j += 1) {
        const r = (src.data as any)[i];
        const g = (src.data as any)[i + 1];
        const b = (src.data as any)[i + 2];
        (dst.data as any)[j] = ((r + g + b) / 3) | 0;
      }
    } else {
      // すでに1chならコピー
      src.copyTo(dst);
    }
    return;
  }

  // 既定: そのままコピー
  src.copyTo(dst);
};

const resize = (src: Mat, dst: Mat, dsize: Size) => {
  dst.rows = dsize.height;
  dst.cols = dsize.width;
  (dst as any)._type = src.type();
  (dst as any)._channels = src.channels();
  const n = dsize.width * dsize.height * src.channels();
  dst._data = new ((src.data as any).constructor)(n);
  (dst.data as any).fill((src.data as any)[0] ?? 0);
};

const GaussianBlur = (src: Mat, dst: Mat) => src.copyTo(dst);
const warpAffine = (src: Mat, dst: Mat, _M: Mat, dsize: Size) => resize(src, dst, dsize);

// ★ 追加: 簡易 Canny（グレイスケール化→コピーのダミー）
const Canny = (src: Mat, dst: Mat, _t1 = 50, _t2 = 100) => {
  const gray = new Mat();
  // 入力がRGBA/RGBならグレー化、1chならそのまま
  if (src.channels() === 4) {
    cvtColor(src, gray, COLOR_RGBA2GRAY);
  } else if (src.channels() === 3) {
    cvtColor(src, gray, COLOR_RGB2GRAY);
  } else {
    src.copyTo(gray);
  }
  gray.copyTo(dst);
  gray.delete();
};

const split = (src: Mat, out: MatVector) => {
  const ch = src.channels();
  const planeSize = Math.floor((src.data as any).length / ch);
  for (let c = 0; c < ch; c++) {
    const m = new Mat(src.rows, src.cols, CV_8UC1);
    for (let i = 0, j = c; i < planeSize; i++, j += ch) {
      (m.data as any)[i] = (src.data as any)[j];
    }
    out.push_back(m);
  }
};

const merge = (mv: MatVector, dst: Mat) => {
  const ch = mv.size();
  if (ch === 0) return;
  const ref = mv.get(0);
  dst.rows = ref.rows; dst.cols = ref.cols;
  (dst as any)._channels = ch;
  (dst as any)._type = ch === 4 ? CV_8UC4 : ch === 3 ? CV_8UC3 : CV_8UC1;
  dst._data = new Uint8Array(dst.rows * dst.cols * ch);
  const planeSize = (ref.data as any).length;
  for (let c = 0; c < ch; c++) {
    const m = mv.get(c);
    for (let i = 0, j = c; i < planeSize; i++, j += ch) {
      (dst.data as any)[j] = (m.data as any)[i];
    }
  }
};

// モーメント系（簡易モック）
const moments = (_contour: any) => ({
  m00: 1, m10: 0, m01: 0, m11: 0, m20: 0, m02: 0,
  mu20: 0, mu11: 0, mu02: 0,
});

const HuMoments = (_m: any, out: Mat) => {
  out.rows = 7;
  out.cols = 1;
  (out as any)._type = CV_64F;
  (out as any)._channels = 1;
  out._data = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
};

// 輪郭（矩形4点だけ返す簡易モック）
const findContours = (_src: Mat, contours: MatVector) => {
  const rect = new Mat(4, 1, CV_32SC2, [10,10, 10,20, 20,20, 20,10]);
  contours.push_back(rect);
};

// 簡易矩形描画
const rectangle = (img: Mat, p1: Point, p2: Point, color: Scalar, thickness = -1) => {
  const x1 = Math.max(0, Math.min(p1.x, p2.x));
  const y1 = Math.max(0, Math.min(p1.y, p2.y));
  const x2 = Math.min(img.cols - 1, Math.max(p1.x, p2.x));
  const y2 = Math.min(img.rows - 1, Math.max(p1.y, p2.y));
  const ch = img.channels();
  const v = (color[0] ?? 255) | 0;

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const base = (y * img.cols + x) * ch;
      if (thickness < 0) {
        for (let c = 0; c < ch; c++) (img.data as any)[base + c] = c === 3 ? 255 : v;
      } else {
        const edge = y === y1 || y === y2 || x === x1 || x === x2;
        if (edge) for (let c = 0; c < ch; c++) (img.data as any)[base + c] = c === 3 ? 255 : v;
      }
    }
  }
};

const mean = (_src: Mat) => new Scalar(128, 128, 128, 255);

// cv 名前空間
const cvCore = {
  // classes
  Mat, MatVector, Point, Size, Scalar,
  // constants
  CV_8UC1, CV_8UC3, CV_8UC4, CV_32SC2, CV_32FC1, CV_64FC1, CV_64F,
  INTER_LINEAR, BORDER_CONSTANT,
  COLOR_RGBA2RGB, COLOR_RGB2RGBA, COLOR_GRAY2RGB, COLOR_GRAY2RGBA,
  COLOR_RGBA2GRAY, COLOR_RGB2GRAY,
  // utils
  matFromImageData, matFromArray,
  // ops
  cvtColor, resize, GaussianBlur, warpAffine, Canny, split, merge,
  moments, HuMoments, findContours, rectangle, mean,
  // OpenCV.js 互換っぽいフラグ
  onRuntimeInitialized: true,
};

export type Cv = typeof cvCore;

/** ここを default export にする */
export async function getCV(): Promise<Cv> {
  return cvCore;
}

// 互換：cv オブジェクトを named export でも提供
export const cv = cvCore;

// default は関数
export default getCV;

// named exports（互換性維持）
export { Mat, MatVector, Point, Size, Scalar };

