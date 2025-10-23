// src/segmentation/onnx.ts
import * as ort from "onnxruntime-web";
import { resolveU2NetModelUrl } from "@/models/loadU2Net";

// グローバルに 1 回だけ作るセッション（テストからリセット可能）
let _session: ort.InferenceSession | null = null;

/**
 * ONNX モデルをロードして InferenceSession を返す。
 * - 動的 import は使わない（thenable 誤認対策）
 * - 既にロード済みならキャッシュを返す
 */
export async function loadOnnxModel(
  modelPath: string,
): Promise<ort.InferenceSession> {
  if (_session) return _session;

  _session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["wasm"], // 実機/テストの安定化
  } as any);

  // テストがこのログを検証するため、文言は固定
  console.log("ONNX session loaded successfully.");
  return _session;
}

/** 現在のセッション（未ロードなら null） */
export function getOnnxSession(): ort.InferenceSession | null {
  return _session;
}

/**
 * セッションが未初期化ならロードして返す。
 * 明示パスが必要（未指定ならエラーを投げる）。
 */
export async function ensureSession(
  modelPath?: string,
): Promise<ort.InferenceSession> {
  if (_session) return _session;
  if (!modelPath) {
    throw new Error("ONNX session not loaded. Call loadOnnxModel first.");
  }
  return loadOnnxModel(modelPath);
}

/** テスト用ユーティリティ：セッションを明示的に破棄 */
export function resetOnnxSession(): void {
  _session = null;
}
