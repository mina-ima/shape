// src/lib/opencv-loader.ts
import type CV from "@techstark/opencv-js";

// ブラウザ実機では本家をそのまま動的 import
export default async function loadOpenCV(): Promise<typeof CV> {
  const cv = (await import("@techstark/opencv-js")).default as unknown as typeof CV;

  // 既に初期化済みならそのまま返す
  if ((cv as any).wasmInitialized || (cv as any).onRuntimeInitialized === undefined) {
    return cv;
  }

  // onRuntimeInitialized を Promise 化
  await new Promise<void>((resolve) => {
    (cv as any).onRuntimeInitialized = () => {
      (cv as any).wasmInitialized = true;
      resolve();
    };
    // 念のため：すでに初期化済みなら即 resolve
    if ((cv as any).wasmInitialized) resolve();
  });

  return cv;
}
