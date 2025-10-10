// src/segmentation/onnx.ts
import * as ort from "onnxruntime-web";

let session: ort.InferenceSession | null = null;

export async function loadOnnxModel(
  modelPath: string,
): Promise<ort.InferenceSession> {
  if (session) return session;
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["wasm"], // テスト安定化
  });
  console.log("ONNX session loaded successfully.");
  return session;
}

export function getOnnxSession() {
  return session;
}

export async function ensureSession(modelPath?: string) {
  if (!session) {
    if (!modelPath)
      throw new Error("ONNX session not loaded. Call loadOnnxModel first.");
    await loadOnnxModel(modelPath);
  }
  return session!;
}
