import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mocking @techstark/opencv-js globally
vi.mock("@techstark/opencv-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@techstark/opencv-js")>();

  // Helper to create a mock Mat object
  const createMockMat = (rows: number, cols: number, type: number, data?: Uint8Array) => {
    const channels = (type === actual.CV_8UC4) ? 4 : (type === actual.CV_8UC3 ? 3 : 1);
    const size = rows * cols * channels;
    const internalData = data ? new Uint8Array(data) : new Uint8Array(size).fill(0);

    const mat = {
      data: internalData,
      rows: rows,
      cols: cols,
      channels: channels,
      type: vi.fn(() => type),
      ptr: vi.fn(function (r, c) {
        const index = (r * this.cols + c) * this.channels;
        return this.data.subarray(index, index + this.channels);
      }),
      setTo: vi.fn(function (scalar) {
        for (let i = 0; i < this.data.length; i += this.channels) {
          this.data[i] = scalar.w[0];
          this.data[i + 1] = scalar.w[1];
          this.data[i + 2] = scalar.w[2];
          this.data[i + 3] = scalar.w[3];
        }
      }),
      delete: vi.fn(),
      copyTo: vi.fn(function (dst) {
        dst.rows = this.rows;
        dst.cols = this.cols;
        dst.channels = this.channels;
        dst.type = this.type;
        dst.data = new Uint8Array(this.data);
      }),
      // Add other methods as needed
    };
    return mat;
  };

  return { // Promise.resolve を削除
    __esModule: true,
    default: {
      ...actual, // Import and retain actual behavior for unmocked functions
      Mat: vi.fn(function (rows, cols, type, data) {
        return createMockMat(rows, cols, type, data);
      }),
      Scalar: vi.fn((r, g, b, a) => ({ w: [r, g, b, a] })),
      GaussianBlur: vi.fn((src, dst, ksize, sigmaX, sigmaY, borderType) => {
        for (let i = 0; i < src.data.length; i++) {
          dst.data[i] = src.data[i];
        }
      }),
      copyMakeBorder: vi.fn((src, dst, top, bottom, left, right, borderType, value) => {
        for (let i = 0; i < src.data.length; i++) {
          dst.data[i] = src.data[i];
        }
      }),
      cvtColor: vi.fn((src, dst, code, dstCn) => {
        if (code === actual.COLOR_RGBA2RGB) {
          const newSize = src.rows * src.cols * 3;
          const newData = new Uint8Array(newSize);
          for (let i = 0; i < src.rows * src.cols; i++) {
            newData[i * 3] = src.data[i * 4];
            newData[i * 3 + 1] = src.data[i * 4 + 1];
            newData[i * 3 + 2] = src.data[i * 4 + 2];
          }
          dst.rows = src.rows;
          dst.cols = src.cols;
          dst.channels = 3;
          dst.type = vi.fn(() => actual.CV_8UC3);
          dst.data = newData;
        } else if (code === actual.COLOR_RGB2RGBA) {
          const newSize = src.rows * src.cols * 4;
          const newData = new Uint8Array(newSize);
          for (let i = 0; i < src.rows * src.cols; i++) {
            newData[i * 4] = src.data[i * 3];
            newData[i * 4 + 1] = src.data[i * 4 + 1];
            newData[i * 4 + 2] = src.data[i * 4 + 2];
            newData[i * 4 + 3] = 255; // Opaque
          }
          dst.rows = src.rows;
          dst.cols = src.cols;
          dst.channels = 4;
          dst.type = vi.fn(() => actual.CV_8UC4);
          dst.data = newData;
        }
      }),
      split: vi.fn((src, mv) => {
        const channels = src.channels;
        const totalPixels = src.rows * src.cols;
        const planes = [];
        for (let c = 0; c < channels; c++) {
          const planeData = new Uint8Array(totalPixels);
          for (let i = 0; i < totalPixels; i++) {
            planeData[i] = src.data[i * channels + c];
          }
          const planeMat = createMockMat(src.rows, src.cols, actual.CV_8UC1, planeData);
          planes.push(planeMat);
        }
        mv.set = vi.fn((idx, mat) => (mv[idx] = mat));
        for (let i = 0; i < planes.length; i++) {
          mv.set(i, planes[i]);
        }
        mv.get = vi.fn((idx) => mv[idx]);
        mv.size = vi.fn(() => planes.length);
      }),
      merge: vi.fn((mv, dst) => {
        const rows = mv.get(0).rows;
        const cols = mv.get(0).cols;
        const totalPixels = rows * cols;
        const channels = mv.size();

        const mergedData = new Uint8Array(totalPixels * channels);
        for (let i = 0; i < totalPixels; i++) {
          for (let c = 0; c < channels; c++) {
            mergedData[i * channels + c] = mv.get(c).data[i];
          }
        }
        dst.rows = rows;
        dst.cols = cols;
        dst.channels = channels;
        dst.type = vi.fn(() => (channels === 4 ? actual.CV_8UC4 : actual.CV_8UC3));
        dst.data = mergedData;
      }),
      addWeighted: vi.fn((src1, alpha, src2, beta, gamma, dst, dtype) => {
        for (let i = 0; i < src2.data.length; i++) {
          dst.data[i] = src2.data[i];
        }
      }),
      MatVector: vi.fn(() => {
        const mv: any = [];
        mv.set = vi.fn((idx, mat) => (mv[idx] = mat));
        mv.get = vi.fn((idx) => mv[idx]);
        mv.size = vi.fn(() => mv.length);
        mv.delete = vi.fn();
        return mv;
      }),
      Size: vi.fn((w, h) => ({ width: w, height: h })),
    },
  };
});

console.log("Mocking @techstark/opencv-js globally");