import { Tensor as OrtTensor } from "onnxruntime-web";
import {
  loadOnnxModel,
  runOnnxInference,
  getInputInfo,
  resolveHWFromMeta,
} from "./segmentation/model";
import { resolveU2NetModelUrl } from "@/models/loadU2Net"; // 追加：モデルURLの解決

/** 画像を HxW(=320等) にリサイズ→RGB(0..1)→NCHW float32 へ詰め替え */
async function imageToNCHWFloat32(
  image: ImageBitmap | HTMLImageElement,
  H: number,
  W: number,
): Promise<Float32Array> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H); // RGBA 8bit

  // NCHW: [1, 3, H, W]
  const out = new Float32Array(1 * 3 * H * W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      out[0 * H * W + y * W + x] = r;
      out[1 * H * W + y * W + x] = g;
      out[2 * H * W + y * W + x] = b;
    }
  }
  return out;
}

/** 出力テンソル(想定: [1,1,H,W] など) → 0..255 の ImageData(HxW) */
function maskTensorToImageData(
  tensor: OrtTensor,
  H: number,
  W: number,
): ImageData {
  const arr = tensor.data as Float32Array;

  // 0..1 に正規化（安全のため min-max）
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const scale = max > min ? 1 / (max - min) : 1;

  const img = new ImageData(W, H);
  const need = H * W;
  const step = arr.length / need;
  for (let i = 0; i < need; i++) {
    const v = arr[Math.floor(i * step)];
    const norm = (v - min) * scale;
    const g = Math.max(0, Math.min(255, Math.round(norm * 255)));
    const p = i * 4;
    img.data[p + 0] = g;
    img.data[p + 1] = g;
    img.data[p + 2] = g;
    img.data[p + 3] = 255;
  }
  return img;
}

/** 画像を与えて推論し、マスクImageData(320x320等)を返す */
export async function runSegmentation(
  image: ImageBitmap | HTMLImageElement,
  modelPath?: string, // 直参照はやめ、未指定なら resolveU2NetModelUrl() で決定
): Promise<{
  mask: ImageData;
  inputSize: { h: number; w: number };
  outputName: string;
}> {
  // 未指定時は '/models/u2netp.onnx' を解決（将来変更もここで吸収）
  const resolvedModel = modelPath ?? (await resolveU2NetModelUrl("u2netp", "/models"));
  const session = await loadOnnxModel(resolvedModel);

  const { names, name, dims } = getInputInfo(session);
  console.log("[ORT] inputNames:", names);
  console.log("[ORT] using input name:", name);
  console.log("[ORT] input metadata:", (session as any).inputMetadata?.[name]);

  // 入力サイズを決定（メタが無い場合 320 にフォールバック）
  const { h, w } = resolveHWFromMeta(dims, 320);
  console.log(`[ORT] resolved input size HxW=${h}x${w}`);

  const nchw = await imageToNCHWFloat32(image, h, w);
  const { Tensor } = await import("onnxruntime-web");
  const inputTensor = new Tensor("float32", nchw, [1, 3, h, w]) as OrtTensor;

  const outputTensor = await runOnnxInference(inputTensor);

  // 最初の出力をマスクとみなす
  const outName = session.outputNames[0];
  const mask = maskTensorToImageData(outputTensor, h, w);

  console.log("[ORT] inference finished successfully.");
  return { mask, inputSize: { h, w }, outputName: outName };
}

/** （既存ボタン用）ダミー処理：型/配線維持のため残す */
export async function runProcessing(_resolution: number): Promise<void> {
  const { Tensor } = await import("onnxruntime-web");
  const dummy = new Tensor(
    "float32",
    new Float32Array(1 * 3 * 320 * 320),
    [1, 3, 320, 320],
  );
  await runOnnxInference(dummy);
}
