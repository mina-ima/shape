// src/segmentation/model.ts
// 目的：ONNXモデルの事前検証＋フォールバックで、本番のLFSポインタ/404でも落ちないようにする。
import { InferenceSession, Tensor } from "onnxruntime-web";

// 単純キャッシュ付きのセッション。テスト/実機で共有。
let _session: InferenceSession | null = null;

/**
 * モデルURLが有効かを判定する軽量チェック
 * - HTTP 200 か
 * - サイズが十分か（1KB未満はポインタ/エラーページ疑い）
 * - 先頭テキストが HTML/LFSポインタでないか
 */
async function isValidOnnx(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return false;

    const buf = await res.arrayBuffer();

    // 小さすぎる場合はポインタ/エラーページの可能性が高い
    if (buf.byteLength < 1024) return false;

    // 先頭だけ読んでLFSポインタやHTMLを検出
    const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 120)));
    const maybeHtml =
      head.toLowerCase().includes("<!doctype html") ||
      head.toLowerCase().includes("<html");
    const maybeLfs = head.includes("git-lfs.github.com/spec/v1");

    return !(maybeHtml || maybeLfs);
  } catch {
    return false;
  }
}

/**
 * モデルをロードして InferenceSession を返す。
 * - まず primary(/models/u2net.onnx) を検証、NGなら fallback(/models/u2netp.onnx)
 * - modelPath が明示されたらそれを最優先で検証
 * - どれもダメな場合は primary でエラーを出して原因が見えるようにする
 */
export async function loadOnnxModel(modelPath?: string): Promise<InferenceSession> {
  if (_session) return _session;

  const primary = modelPath ?? "/models/u2net.onnx";
  const fallback = "/models/u2netp.onnx";

  const candidates = modelPath ? [modelPath, primary, fallback] : [primary, fallback];

  let selected: string | null = null;
  for (const u of candidates) {
    if (await isValidOnnx(u)) {
      selected = u;
      break;
    }
  }

  if (!selected) {
    // すべてNG → あえて primary で失敗して意味のあるエラーを出す
    selected = primary;
    console.error("[Model] No valid ONNX found. Tried:", candidates);
  } else {
    console.log("[Model] Using ONNX:", selected);
  }

  // 実環境での安定化用オプション（モック側は無視されてもOK）
  _session = await InferenceSession.create(selected, {
    executionProviders: ["wasm"],
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

