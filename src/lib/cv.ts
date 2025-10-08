// src/lib/cv.ts
let cvPromise: Promise<any>;

if (process.env.NODE_ENV === "test") {
  const CV_8UC1 = 0x0000;
  const CV_8UC3 = 0x0003;
  const CV_8UC4 = 0x0004;
  const CV_32FC1 = 0x1000;
  const CV_32SC2 = 0x2002;

  function channelsOf(type: number) {
    if ((type & 0x000f) === 0x0004) return 4;
    if ((type & 0x000f) === 0x0003) return 3;
    return 1;
  }

  class Mat {
    rows: number;
    cols: number;
    type: number;

    // byte data for 8U mats
    data: Uint8Array | undefined;

    // 32S/64F helpers for specific APIs
    data32S: Int32Array;
    data64F: Float64Array;

    constructor(r = 0, c = 0, t = CV_8UC1) {
      this.rows = r;
      this.cols = c;
      this.type = t;

      const ch = channelsOf(t);
      const size = Math.max(1, r * c * ch);
      this.data = new Uint8Array(size);

      // for HuMoments etc.
      this.data32S = new Int32Array(Math.max(1, r * c * 2));
      this.data64F = new Float64Array(7);
    }

    static zeros(r: number, c: number, t: number) {
      const m = new Mat(r, c, t);
      if (m.data) m.data.fill(0);
      return m;
    }

    delete() {}
  }

  // 最低限の moments/HuMoments ダミー
  const moments = (_contour: any) => ({
    m00: 1, m10: 0, m01: 0, m11: 0, m20: 0, m02: 0, m30: 0, m03: 0,
  });

  const HuMoments = (_m: any, out: any) => {
    // 7要素を必ず埋める
    out.data64F = new Float64Array([1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625]);
    return out;
  };

  // （必要になったらここに GaussianBlur/resize などの no-op 実装を追加）

  cvPromise = Promise.resolve({
    Mat,
    CV_8UC1,
    CV_8UC3,
    CV_8UC4,
    CV_32FC1,
    CV_32SC2,
    moments,
    HuMoments,
  });
} else {
  cvPromise = import("./opencv-loader").then((m) => m.default());
}

export default cvPromise;
