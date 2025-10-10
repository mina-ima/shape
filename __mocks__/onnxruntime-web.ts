// __mocks__/onnxruntime-web.ts
// WASM を読み込まない軽量モック

export class Tensor<T extends string = any> {
  type: T;
  data: any;
  dims: number[];
  constructor(type: T, data: any, dims: number[]) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

export class InferenceSession {
  inputNames = ["input.1"];
  outputNames = ["output"];
  static async create(_bytesOrPath: any, _opts?: any) {
    return new InferenceSession();
  }
  async run(_inputs: Record<string, Tensor> | Tensor) {
    // 320x320 のダミーマスクを返す
    const data = new Float32Array(1 * 1 * 320 * 320);
    return { output: { data, dims: [1, 1, 320, 320] } };
  }
}

// 既存コードが default import を使っても動くように
const defaultExport = { Tensor, InferenceSession };
export default defaultExport;
