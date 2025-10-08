// src/processing.ts
// onnxruntime-web は動的 import（バンドル軽量化）
import type { Tensor as OrtTensor } from "onnxruntime-web"
import { loadOnnxModel, runOnnxInference } from "./segmentation/model"

// public/models に置いた ONNX の URL
const DEFAULT_MODEL_PATH = "/models/u2net.onnx" // 実ファイル名に合わせて変更可

/**
 * 入力メタデータをダンプして、モデルが要求する shape と入力名を推定する。
 * - H/W が数値ならその値を採用（例: 320）
 * - 未定義/動的の場合は 320 にフォールバック（U^2-Net 等の一般的既定）
 */
function resolveInputFromMetadata(session: any, hardFallback: number = 320) {
  const inputNames: string[] = session.inputNames ?? []
  const name = inputNames[0] ?? "input"

  const meta = session.inputMetadata?.[name]
  const dims: Array<number | null | undefined> = meta?.dimensions

  // デバッグログ（必要ならコメントアウト可）
  console.log("[ORT] inputNames:", inputNames)
  console.log("[ORT] using input name:", name)
  console.log("[ORT] input metadata:", meta)

  // 既定は NCHW
  let n = 1, c = 3, h = hardFallback, w = hardFallback

  if (Array.isArray(dims) && dims.length >= 4) {
    // N
    if (typeof dims[0] === "number" && dims[0]! > 0) n = dims[0] as number
    // C
    if (typeof dims[1] === "number" && dims[1]! > 0) c = dims[1] as number
    // H
    if (typeof dims[2] === "number" && dims[2]! > 0) h = dims[2] as number
    // W
    if (typeof dims[3] === "number" && dims[3]! > 0) w = dims[3] as number
  }

  // U^2-Net 系は 320×320 固定が多い：H/W が未確定（-1 等）の場合は 320 を優先
  if (!Number.isFinite(h) || h <= 0) h = hardFallback
  if (!Number.isFinite(w) || w <= 0) w = hardFallback

  return { name, shape: [n, c, h, w] as [number, number, number, number] }
}

export async function runProcessing(
  _resolution: number, // 受け取るが、固定次元モデルでは使わない
  modelPath: string = DEFAULT_MODEL_PATH
): Promise<void> {
  // 1) モデルを読み込み（fetch→Uint8Array→Session 作成は model.ts 側で実施）
  const session = await loadOnnxModel(modelPath)

  // 2) 入力名と shape をメタデータから決定（動的/未指定なら 320 にフォールバック）
  const { name: inputName, shape } = resolveInputFromMetadata(session, 320)
  const [n, c, h, w] = shape
  console.log(`[ORT] resolved input shape [N,C,H,W]=[${n},${c},${h},${w}] for "${inputName}"`)

  // 3) 入力テンソル（ダミーデータ）
  const size = n * c * h * w
  const data = new Float32Array(size) // 0 で埋める
  const { Tensor } = await import("onnxruntime-web")
  const inputTensor = new Tensor("float32", data, shape) as unknown as OrtTensor

  // 4) 推論（名前付きマップで確実に）
  await runOnnxInference(session, { [inputName]: inputTensor } as any)

  // 5) 後処理は必要に応じて
  console.log("[ORT] inference finished successfully.")
}
