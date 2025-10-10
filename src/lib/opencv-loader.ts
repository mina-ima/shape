// src/lib/opencv-loader.ts
import type CV from "@techstark/opencv-js";

// 1回ロードしたら再利用するキャッシュ
let cachedCv: typeof CV | null = null;

/**
 * OpenCV を動的 import し、WASM 初期化完了を待ってから返す。
 * 2回目以降はキャッシュを返すので高速。
 */
export default async function loadOpenCV(): Promise<typeof CV> {
  if (cachedCv) return cachedCv;

  const cv = (await import("@techstark/opencv-js"))
    .default as unknown as typeof CV;

  // すでに初期化済み、または onRuntimeInitialized を使わないビルドなら即返す
  if (
    (cv as any).wasmInitialized ||
    typeof (cv as any).onRuntimeInitialized === "undefined"
  ) {
    cachedCv = cv;
    return cv;
  }

  // 初期化完了を待つ（多重にハンドラが登録されても前の処理は維持）
  await new Promise<void>((resolve) => {
    const prev = (cv as any).onRuntimeInitialized;
    (cv as any).onRuntimeInitialized = () => {
      (cv as any).wasmInitialized = true;
      if (typeof prev === "function") prev();
      resolve();
    };
    if ((cv as any).wasmInitialized) resolve();
  });

  cachedCv = cv;
  return cv;
}

// 好みで named import でも使えるようにエクスポート
export { loadOpenCV };
