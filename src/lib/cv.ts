// src/lib/cv.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

// FORCED MOCK FOR DEBUGGING

class Mat {
  rows: number;
  cols: number;
  type: number;
  _data: Uint8Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;
  _channels: number;

  constructor(rows = 0, cols = 0, type = 4, data?: any) {
    this.rows = rows;
    this.cols = cols;
    this.type = type;
    if (type === 0 || type === 5) this._channels = 1;
    else if (type === 0x2002) this._channels = 2;
    else if (type === 3) this._channels = 3;
    else this._channels = 4;
    const size = rows * cols * this._channels;
    if (type === 6) this._data = new Float64Array(size);
    else if (type === 0x2002) this._data = new Int32Array(size);
    else this._data = new Uint8Array(size);
    if (data) this._data.set(data);
  }

  ptr(row: number, col: number) {
    const index = (row * this.cols + col) * this._channels;
    return this._data.subarray(index, index + this._channels);
  }

  channels() { return this._channels; }

  copyTo(dst: Mat, mask?: Mat) {
    dst.rows = this.rows;
    dst.cols = this.cols;
    dst.type = this.type;
    dst._channels = this._channels;
    dst._data = new (this._data.constructor as any)(this._data);
    if (mask && mask._data) {
      for (let i = 0; i < this.rows * this.cols; i++) {
        if (mask._data[i] === 0) {
          for (let c = 0; c < this._channels; c++) {
            dst._data[i * this._channels + c] = 0;
          }
        }
      }
    }
  }

  convertTo(dst: Mat, type: number, alpha = 1, beta = 0) {
    dst.rows = this.rows;
    dst.cols = this.cols;
    dst.type = type;
    dst._channels = this._channels;
    const constructor = type === 6 ? Float64Array : this._data.constructor;
    dst._data = new (constructor as any)(this._data.length);
    for (let i = 0; i < this._data.length; i++) {
      dst._data[i] = this._data[i] * alpha + beta;
    }
  }

  delete() {
    this.rows = 0;
    this.cols = 0;
    this._data = new Uint8Array(0);
  }

  get data() { return this._data as Uint8Array; }
  get data32S() { return this._data as Int32Array; }
  get data64F() { return this._data as Float64Array; }
}

class MatVector {
  private arr: Mat[] = [];
  size() { return this.arr.length; }
  get(i: number) { return this.arr[i]; }
  push_back(m: Mat) { this.arr.push(m); }
  delete() { this.arr.forEach(m => m.delete()); this.arr.length = 0; }
}

const cvCore = {
  Mat,
  MatVector,
  Point: class Point { constructor(public x: number, public y: number) {} },
  Size: class Size { constructor(public width: number, public height: number) {} },
  Scalar: class Scalar extends Array<number> {},
  CV_8UC1: 0,
  CV_8UC3: 3,
  CV_8UC4: 4,
  CV_32SC2: 0x2002,
  CV_32FC1: 5,
  CV_64FC1: 6,
  INTER_LINEAR: 1,
  BORDER_CONSTANT: 0,
  COLOR_RGBA2RGB: 1,
  COLOR_RGB2RGBA: 2,
  COLOR_GRAY2RGBA: 8,
  RETR_EXTERNAL: 0,
  CHAIN_APPROX_SIMPLE: 2,
  matFromImageData: (imageData: ImageData) => new Mat(imageData.height, imageData.width, 4, imageData.data),
  matFromArray: (rows: number, cols: number, type: any, array: number[]) => new Mat(rows, cols, type, array),
  imshow: () => {},
  rectangle: () => {},
  drawContours: () => {},
  circle: () => {},
  cvtColor: (src: Mat, dst: Mat, _code: any) => src.copyTo(dst),
  resize: (src: Mat, dst: Mat, dsize: any) => {
    dst.rows = dsize.height;
    dst.cols = dsize.width;
    dst.type = src.type;
    dst._channels = src.channels();
    dst._data = new (src._data.constructor as any)(dsize.width * dsize.height * dst._channels);
  },
  GaussianBlur: (src: Mat, dst: Mat) => src.copyTo(dst),
  warpAffine: (src: Mat, dst: Mat, _M: Mat, dsize: any) => {
    dst.rows = dsize.height;
    dst.cols = dsize.width;
    dst.type = src.type;
    dst._channels = src.channels();
    dst._data = new (src._data.constructor as any)(dsize.width * dsize.height * dst._channels);
    src.copyTo(dst);
  },
  moments: () => ({ m00: 1, m10: 1, m01: 1, m20: 1, m11: 1, m02: 1, mu20: 1, mu11: 1, mu02: 1 }),
  HuMoments: (_moments: any, hu: Mat) => {
    const huValues = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    hu.rows = 7;
    hu.cols = 1;
    hu.type = 6;
    hu._channels = 1;
    hu._data = huValues;
  },
  findContours: (_src: Mat, contours: MatVector, _hierarchy: Mat, _mode: any, _method: any) => {
    const contour = new Mat(4, 1, 0x2002, [10,10, 10,20, 20,20, 20,10]);
    contours.push_back(contour);
  },
  split: (src: Mat, dstVec: MatVector) => {
    const channels = src.channels();
    for (let i = 0; i < channels; i++) {
      const channelMat = new Mat(src.rows, src.cols, 0);
      for (let j = 0; j < src.rows * src.cols; j++) {
        channelMat.data[j] = src.data[j * channels + i];
      }
      dstVec.push_back(channelMat);
    }
  },
  merge: (srcVec: MatVector, dst: Mat) => {
    const size = srcVec.size();
    if (size === 0) return;
    const C1 = srcVec.get(0);
    dst.rows = C1.rows;
    dst.cols = C1.cols;
    dst.type = size === 4 ? 4 : size === 3 ? 3 : 0;
    dst._channels = size;
    dst._data = new Uint8Array(dst.rows * dst.cols * dst._channels);
    for (let i = 0; i < dst.rows * dst.cols; i++) {
      for (let c = 0; c < size; c++) {
        dst.data[i * size + c] = srcVec.get(c).data[i];
      }
    }
  },
  mean: () => new cvCore.Scalar(128, 128, 128, 255),
  onRuntimeInitialized: Promise.resolve(true),
};

const cvPromise: Promise<any> = Promise.resolve(cvCore);

export default cvPromise;