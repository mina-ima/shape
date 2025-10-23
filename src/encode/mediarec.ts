// src/encode/mediarec.ts
import cv from "@techstark/opencv-js";

/**
 * MediaRecorder で cv.Mat[] を動画化して Blob を返す。
 * - Canvas.captureStream(fps) を使用（OffscreenCanvas対応）
 * - cv.imshow で 1/FPS ごとに確実に描画
 * - timeslice ありで dataavailable を安定化
 * - 実際の chunks[0].type を返却 MIME に採用（UAが変えるケースに対応）
 * - 極小 Blob（<64KB）は不正として上位にフォールバック
 */

export type TargetMime = "video/webm" | "video/mp4";
const MIN_VALID_SIZE = 64 * 1024; // 64KB 未満は破損/短尺とみなす

export async function encodeWithMediaRecorder(
  frames: cv.Mat[],
  fps: number,
  target: TargetMime,
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
  if (!stream) throw new Error("Canvas.captureStream() is not supported.");

  // MediaRecorder 準備（isTypeSupported で最適候補を選ぶ）
  const prefer = pickMediaRecorderMime(target);
  const options: MediaRecorderOptions = prefer
    ? { mimeType: prefer, videoBitsPerSecond: 4_000_000 }
    : { videoBitsPerSecond: 4_000_000 };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch {
    // 一部 UA は mimeType 不一致で例外 → UA 任せで作り直し
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
        // **重要**: UA が実際に吐いた最初のチャンクの type を採用
        const effectiveType =
          (chunks[0] as any)?.type ||
          (recorder as any).mimeType ||
          (options as any).mimeType ||
          target;
        const blob = new Blob(chunks, { type: effectiveType });
        resolve(blob);
      } catch (e) {
        reject(e);
      }
    });
    recorder.addEventListener("error", (e: any) => reject(e?.error ?? e));
  });

  // timeslice ありで開始（200msごとに dataavailable が出る。mux 安定＆短尺化対策）
  recorder.start(200);
  await startPromise;

  // 描画: cv.imshow を使う（RGBA→描画を内部で処理）
  const drawFrame = (mat: cv.Mat) => {
    (cv as any).imshow(canvas as any, mat); // Offscreen/HTMLCanvas 両対応
  };

  const frameInterval = Math.max(4, Math.round(1000 / Math.max(1, fps)));

  // 1/FPS ごとに確実に 1 フレームずつ描く
  for (let i = 0; i < frames.length; i++) {
    drawFrame(frames[i]);
    // eslint-disable-next-line no-await-in-loop
    await wait(frameInterval);
  }

  // Mux 終端安定のため 1 フレーム分待つ（最終タイムスタンプが 0 扱いになるのを防ぐ）
  await wait(frameInterval);

  // 停止して Blob を取得
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await resultPromise;

  // ストリームをクリーンアップ
  stream.getTracks().forEach((t) => t.stop());

  // 極小（= ヘッダのみ/断片のみ）の検出。小さすぎる場合はフォールバック促進のため失敗にする
  if (!blob || blob.size < MIN_VALID_SIZE) {
    throw new Error(`Recorded blob is too small (${blob?.size ?? 0} bytes).`);
  }

  return blob;
}

/* ---------------- ユーティリティ ---------------- */

// UAごとの最適候補（Androidは webm 優先、iOS系で mp4 を含む）
function pickMediaRecorderMime(target: TargetMime): string | undefined {
  const MR: any = (window as any).MediaRecorder;
  if (!MR?.isTypeSupported) return undefined;

  const candidates =
    target === "video/webm"
      ? [
          "video/webm;codecs=vp9,opus", // 互換性が高い順
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=vp8",
          "video/webm",
        ]
      : [
          // Android では 'video/mp4' 非対応が多いが、iOS/Safari 向けには試す価値あり
          "video/mp4;codecs=avc1.42E01E",
          "video/mp4",
        ];

  for (const c of candidates) {
    try {
      if (MR.isTypeSupported(c)) return c;
    } catch {
      /* UA 実装差で例外のことがあるため握りつぶす */
    }
  }
  return undefined; // ブラウザ任せ
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
