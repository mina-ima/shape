// src/segmentation/model.ts
// onnxruntime-web を遅延読み込み（初期バンドル削減）
import type * as ort from "onnxruntime-web"

// 実体ロード（runtime 用）
async function loadOrt() {
  const m = await import("onnxruntime-web")
  return m
}

// 文字列URL or バイト列の両対応でモデルを読み込む
export async function loadOnnxModel(
  model: string | Uint8Array,
  options?: ort.InferenceSession.SessionOptions
) {
  const ortLib = await loadOrt()

  let source: Uint8Array
  if (typeof model === "string") {
    // 文字列URLなら自分で fetch して確実にバイト列を渡す（HTML混入を検知）
    const res = await fetch(model, { cache: "no-store" })
    if (!res.ok) {
      const head = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      throw new Error(
        `Failed to fetch model: ${res.status} ${res.statusText} @ ${model}. ` +
        `Preview: ${head.replace(/\s+/g, " ")}`
      )
    }
    const buf = await res.arrayBuffer()
    source = new Uint8Array(buf)
    if (source.byteLength < 1024) {
      // 通常のONNXは数百KB〜MB。小さすぎる場合はHTMLなどの可能性が高い
      throw new Error(`Model content too small (${source.byteLength} bytes) at ${model}. Is the path correct?`)
    }
  } else {
    source = model
  }

  return await ortLib.InferenceSession.create(source, {
    executionProviders: ["wasm"],
    ...(options ?? {})
  })
}

// 推論（単一 Tensor / 入力マップの両対応）
export async function runOnnxInference(
  session: ort.InferenceSession,
  inputs: Record<string, ort.Tensor> | ort.Tensor
) {
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
