// src/lib/cv.ts
let cvPromise: Promise<any>;

if (process.env.NODE_ENV === "test") {
  // Vitest ではモックを返す（必要最低限のAPIだけダミー化）
  cvPromise = Promise.resolve({
    Mat: class {
      rows: number; cols: number; type: number; data32S = new Int32Array();
      constructor(r: number, c: number, t: number) { this.rows = r; this.cols = c; this.type = t; }
      delete() {}
    },
    CV_32SC2: 0,
    onRuntimeInitialized: Promise.resolve(),
  });
} else {
  // 実機/開発はローダー経由で OpenCV を解決
  cvPromise = import("./opencv-loader").then((m) => m.default());
}

export default cvPromise;
