// src/segmentation/model.ts
import type * as ort from "onnxruntime-web"

let cached: {
  url?: string
  session?: ort.InferenceSession
} = {}

async function loadOrt() {
  return await import("onnxruntime-web")
}

/** URL文字列/バイト列どちらでも読み込み可。モジュール内でセッションをキャッシュ。 */
export async function loadOnnxModel(
  model: string | Uint8Array,
  options?: ort.InferenceSession.SessionOptions
): Promise<ort.InferenceSession> {
  const ortLib = await loadOrt()

  if (typeof model === "string") {
    if (cached.url === model && cached.session) return cached.session!
    const res = await fetch(model, { cache: "no-store" })
    if (!res.ok) {
      const head = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      throw new Error(`Failed to fetch model: ${res.status} ${res.statusText} @ ${model}. Preview: ${head}`)
    }
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    if (bytes.byteLength < 1024) throw new Error(`Model content too small at ${model}`)
    const session = await ortLib.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
      ...(options ?? {}),
    })
    cached = { url: model, session }
    return session
  } else {
    const session = await ortLib.InferenceSession.create(model, {
      executionProviders: ["wasm"],
      ...(options ?? {}),
    })
    cached = { url: undefined, session }
    return session
  }
}

/** 単一テンソル or 入力マップどちらでもOK */
export async function runOnnxInference(
  session: ort.InferenceSession,
  inputs: Record<string, ort.Tensor> | ort.Tensor
) {
  const isSingle = inputs && typeof (inputs as any).dims !== "undefined"
  if (isSingle) {
    const name = session.inputNames?.[0] ?? "input"
    return await session.run({ [name]: inputs as ort.Tensor })
  }
  return await session.run(inputs as Record<string, ort.Tensor>)
}

/** 入力メタをざっくり取得（無いこともある） */
export function getInputInfo(session: ort.InferenceSession) {
  const names = session.inputNames ?? []
  const name = names[0] ?? "input"
  const meta: any = (session as any).inputMetadata?.[name]
  const dims: Array<number | null | undefined> | undefined = meta?.dimensions
  return { names, name, dims }
}

/** 最終2次元(H,W)を取り出すユーティリティ（なければ 320x320） */
export function resolveHWFromMeta(dims?: Array<number | null | undefined>, fallback = 320) {
  let h = fallback, w = fallback
  if (Array.isArray(dims) && dims.length >= 4) {
    if (typeof dims[2] === "number" && dims[2]! > 0) h = dims[2] as number
    if (typeof dims[3] === "number" && dims[3]! > 0) w = dims[3] as number
  }
  return { h, w }
}
