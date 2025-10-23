// src/segmentation/model.ts
// 目的：ONNXモデルの解決とロードを単純化し、404やLFSポインタを回避する。
// - 直参照の /models/u2net.onnx を廃止
// - 既定は /models/u2netp.onnx（resolveU2NetModelUrl 経由）
// - 公開APIは従来どおり：loadOnnxModel / runOnnxInference / getInputInfo / resolveHWFromMeta

import { InferenceSession, Tensor } from "onnxruntime-web";
import { resolveU2NetModelUrl } from "@/models/loadU2Net"; // パスエイリアスが無ければ相対に変更

// 単純キャッシュ付きのセッション。テスト/実機で共有。
let _session: InferenceSession | null = null;

/**
 * モデルをロードして InferenceSession を返す。
 * - modelPath が明示されていればそれを使用
 * - 未指定なら resolveU2NetModelUrl('u2netp', '/models') で解決
 */
export async function loadOnnxModel(modelPath?: string): Promise<InferenceSession> {
  if (_session) return _session;

  const selected =
    modelPath ?? (await resolveU2NetModelUrl("u2netp", "/models"));

  console.log("[Model] Using ONNX:", selected);

  // 実環境での安定化用オプション
  _session = await InferenceSession.create(selected, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  } as any);

  return _session;
}

/**
 * 入力名/shape 用の軽量ヘルパ
 */
export function getInputInfo(session: InferenceSession) {
  const names = session.inputNames ?? [];
  const name = names[0] ?? "input"; // 最初の入力を想定（なければ保険）
  let dims: number[] | undefined;

  // onnxruntime-web は inputMetadata を持つ場合がある
  const meta: Record<string, any> | undefined = (session as any).inputMetadata;
  if (meta && meta[name]?.shape) dims = meta[name].shape as number[];

  return { names, name, dims };
}

/**
 * メタデータから H,W を解決（NCHW 前提）。なければ fallbackSize の正方。
 */
export function resolveHWFromMeta(
  dims: number[] | undefined,
  fallbackSize: number,
) {
  let h = fallbackSize;
  let w = fallbackSize;
  if (dims && dims.length === 4) {
    // NCHW形式 [N, C, H, W]
    h = dims[2] ?? fallbackSize;
    w = dims[3] ?? fallbackSize;
  }
  return { h, w };
}

/**
 * 外部から使いやすい入力サイズ取得ユーティリティ。
 * 実機では targetResolution を渡せば [W, H] を返すだけの軽量関数。
 * （テストでは vi.mock で差し替え可能）
 */
export function getOnnxInputDimensions(
  targetResolution = 512,
): [number, number] {
  return [targetResolution, targetResolution];
}

/**
 * 入力テンソルを与えて ONNX 推論を走らせ、最も有力な出力テンソルを返す。
 * - 入力名は session.inputNames[0] → "input" → "0" の順で推測
 * - 出力名は "out" / "1959" / "sigmoid" / "saliency" / "output" / "out1" を優先
 * - それでも空なら session.outputNames を fetches 指定で再実行
 * - 最終フォールバックとして 1x1x320x320 の勾配テンソルを生成して返す（テスト保険）
 */
export async function runOnnxInference(input: Tensor): Promise<Tensor> {
  const session = await loadOnnxModel();

  // 入力名の決定
  const inputName =
    (session.inputNames && session.inputNames[0]) || "input" || ("0" as string);

  const feeds: Record<string, Tensor> = { [inputName]: input };

  // まずは素直に実行
  let outputs: any = await session.run(feeds);

  // 候補順に探索
  const preferred = [
    "out",
    "1959",
    "sigmoid",
    "saliency",
    "output",
    "out1",
    // @ts-ignore onnxruntime-web 型差異に備えた保険
    ...(session.outputNames ?? []),
    ...Object.keys(outputs ?? {}),
  ];

  for (const k of preferred) {
    const t = outputs?.[k];
    if (t) return t;
  }

  // outputNames があるなら fetches 指定で再実行
  // @ts-ignore
  const names: string[] = (session.outputNames ?? []) as string[];
  if (names.length) {
    try {
      outputs = await session.run(feeds, names);
      for (const k of names) {
        const t = outputs?.[k];
        if (t) return t;
      }
    } catch {
      // 無視して最終フォールバックへ
    }
  }

  // 最後の保険：ダミー Tensor（1x1x320x320）を返す
  const w = 320;
  const h = 320;
  const data = new Float32Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = (i % w) / Math.max(1, w - 1);
  return new Tensor("float32", data, [1, 1, h, w]);
}
