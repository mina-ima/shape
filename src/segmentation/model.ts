// src/segmentation/model.ts
// onnxruntime-web を遅延読み込み（初期バンドル削減）
import type * as ort from "onnxruntime-web"

// 実体ロード（runtime 用）
async function loadOrt() {
  const m = await import("onnxruntime-web")
  return m
}

// モデル読み込み
export async function loadOnnxModel(
  modelPath: string,
  options?: ort.InferenceSession.SessionOptions
) {
  const ortLib = await loadOrt()
  return await ortLib.InferenceSession.create(modelPath, options ?? {})
}

// 推論（単一 Tensor / 入力マップの両対応）
export async function runOnnxInference(
  session: ort.InferenceSession,
  inputs: Record<string, ort.Tensor> | ort.Tensor
) {
  // 単一 Tensor が来た場合は最初の入力名で包む
  const isSingleTensor = inputs && typeof (inputs as any).dims !== "undefined"
  if (isSingleTensor) {
    const name = session.inputNames?.[0] ?? "input"
    return await session.run({ [name]: inputs as ort.Tensor })
  }
  return await session.run(inputs as Record<string, ort.Tensor>)
}

// 入力次元（NCHW）: 正方入力を仮定
export function getOnnxInputDimensions(resolution: number): [number, number, number, number] {
  const size = Math.max(1, Math.floor(resolution))
  return [1, 3, size, size]
}
