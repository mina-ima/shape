// src/encode/mediarec.ts
import cv from "@techstark/opencv-js";

/**
 * MediaRecorder で cv.Mat[] を動画化して Blob を返す。
 * - Canvas.captureStream(fps) を使用
 * - cv.imshow で 1/FPS ごとに確実に描画
 * - stop 後の dataavailable を await
 * - 極小 Blob は失敗として上位にフォールバックさせる
 */
export async function encodeWithMediaRecorder(
  frames: cv.Mat[],
  fps: number,
  mimeType: string,
): Promise<Blob> {
  if (typeof window === "undefined" || typeof (window as any).MediaRecorder !== "function") {
    throw new Error("MediaRecorder is not available.");
  }
  if (!frames?.length) throw new Error("No frames provided.");

  const width = frames[0].cols;
  const height = frames[0].rows;
  if (!width || !height) throw new Error("Invalid frame size.");

  // Canvas（OffscreenCanvas があれば優先）
  const hasOffscreen = typeof OffscreenCanvas !== "undefined";
  const canvas: HTMLCanvasElement | OffscreenCanvas = hasOffscreen
    ? new OffscreenCanvas(width, height)
    : (document.createElement("canvas") as HTMLCanvasElement);

  (canvas as any).width = width;
  (canvas as any).height = height;

  // captureStream
  const stream: MediaStream =
    (canvas as any).captureStream?.(fps) ??
    (canvas as HTMLCanvasElement).captureStream?.(fps);
  if (!stream) {
    throw new Error("Canvas.captureStream() is not supported.");
  }

  // MediaRecorder 準備
  const options: MediaRecorderOptions = {
    mimeType,
    // 低すぎると「音無し・映像ビットほぼゼロ」になりやすい端末があるため、ある程度確保
    videoBitsPerSecond: 4_000_000,
  };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch (e) {
    // 一部 UA では mimeType 不一致で例外になる
    recorder = new MediaRecorder(stream);
  }

  const chunks: BlobPart[] = [];

  const startPromise = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("start", () => resolve());
    recorder.addEventListener("error", (e: any) => reject(e?.error ?? e));
  });

  const resultPromise = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    });
    recorder.addEventListener("stop", () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      } catch (e) {
        reject(e);
      }
    });
    recorder.addEventListener("error", (e: any) => reject(e?.error ?? e));
  });

  recorder.start(); // timeslice なし: stop 時に dataavailable が 1 回来る挙動に合わせる
  await startPromise;

  // 描画: cv.imshow を使う（RGBA→描画を内部で処理してくれる）
  const drawFrame = (mat: cv.Mat) => {
    // OffscreenCanvas/HTMLCanvasElement どちらでも (as any) で渡せば OK
    (cv as any).imshow(canvas as any, mat);
  };

  const frameInterval = 1000 / Math.max(1, fps);

  // 1/FPS ごとに確実に 1 フレームずつ描く
  for (let i = 0; i < frames.length; i++) {
    drawFrame(frames[i]);
    await wait(frameInterval);
  }

  // Mux 終端安定のため 1 フレーム分待つ（最終タイムスタンプが 0 扱いになるのを防ぐ）
  await wait(frameInterval);

  // 停止して Blob を取得
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await resultPromise;

  // ストリームをクリーンアップ
  stream.getTracks().forEach((t) => t.stop());

  // 極小（= ヘッダのみ）の検出。小さすぎる場合はフォールバック促進のため失敗にする
  if (!blob || blob.size < 4096) {
    throw new Error(`Recorded blob is too small (${blob?.size ?? 0} bytes).`);
  }

  return blob;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
