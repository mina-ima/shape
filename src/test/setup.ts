import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

if (typeof global.ImageData === "undefined") {
  global.ImageData = class ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  } as typeof ImageData;
}

if (typeof global.Worker === "undefined") {
  global.Worker = class Worker {
    constructor(_stringUrl: string | URL, _options?: WorkerOptions) {}
    postMessage(
      _message: unknown,
      _transfer?: Transferable[] | StructuredSerializeOptions,
    ): void {}
    terminate(): void {}
    addEventListener(
      _type: string,
      _listener: EventListenerOrEventListenerObject,
      _options?: boolean | AddEventListenerOptions,
    ): void {}
    removeEventListener(
      _type: string,
      _listener: EventListenerOrEventListenerObject,
      _options?: boolean | EventListenerOptions,
    ): void {}
    onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
    onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
    onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;
    dispatchEvent(_event: Event): boolean {
      return false;
    }
  } as typeof Worker;
}

vi.mock("@techstark/opencv-js", () => {
  console.log("Mocking @techstark/opencv-js globally");

  const mockMat = () => ({
    delete: vi.fn(),
    data: new Uint8Array(100 * 100 * 4),
    data32S: new Int32Array(128 * 2),
    data64F: new Float64Array(7),
    rows: 100,
    cols: 100,
    set: vi.fn(),
    channels: () => 4,
    copyTo: vi.fn(),
    setTo: vi.fn(),
    type: () => 24, // CV_8UC4
    convertTo: vi.fn(),
  });

  const mockCv = {
    matFromImageData: vi.fn((imageData: ImageData) => {
      const mat = mockMat();
      mat.rows = imageData.height;
      mat.cols = imageData.width;
      return mat;
    }),
    matFromArray: vi.fn((_rows, _cols, _type, _data) => mockMat()),
    cvtColor: vi.fn(),
    Canny: vi.fn(),
    Mat: Object.assign(vi.fn(mockMat), { ones: vi.fn(mockMat) }),
    MatVector: vi.fn(() => ({
      size: vi.fn(() => 1),
      get: vi.fn(() => mockMat()),
      delete: vi.fn(),
      push_back: vi.fn(),
    })),
    Point: vi.fn((x, y) => ({ x, y })),
    Size: vi.fn((width, height) => ({ width, height })),
    Scalar: vi.fn((v0, v1, v2, v3) => [v0, v1, v2, v3]),
    rectangle: vi.fn(),
    findContours: vi.fn(),
    contourArea: vi.fn(() => 100),
    arcLength: vi.fn(() => 400),
    moments: vi.fn(() => ({ m00: 100, m10: 5000, m01: 5000 })),
    HuMoments: vi.fn((_moments, huMomentsMat) => {
      huMomentsMat.rows = 7;
      const mockHu = [1, 2, 3, 4, 5, 6, 7];
      mockHu.forEach((v, i) => (huMomentsMat.data64F[i] = v));
    }),
    morphologyEx: vi.fn(),
    split: vi.fn(),
    resize: vi.fn(),
    addWeighted: vi.fn(),
    bitwise_and: vi.fn(),
    merge: vi.fn(),
    dilate: vi.fn(),
    warpAffine: vi.fn(),
    GaussianBlur: vi.fn(),
    MORPH_OPEN: 2,
    RETR_EXTERNAL: 0,
    CHAIN_APPROX_SIMPLE: 0,
    COLOR_RGBA2GRAY: 0,
    CV_8U: 0,
    CV_8UC1: 0,
    CV_8UC3: 16,
    CV_8UC4: 24,
    CV_32F: 5,
    CV_32FC2: 13,
    CV_32SC2: 12,
  };

  // @ts-expect-error - Mocking the default export
  mockCv.default = mockCv;

  return mockCv;
});
