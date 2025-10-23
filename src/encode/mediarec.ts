// src/encode/mediarec.ts
import cv from "@techstark/opencv-js";

/**
 * MediaRecorder で cv.Mat[] を動画化して Blob を返す。
 * - Canvas.captureStream(fps) を使用（OffscreenCanvas対応）
 * - cv.imshow で 1/FPS ごとに確実に描画
 * - timeslice ありで dataavailable を安定化
 * - UA が実際に吐いた MIME（dataavailable.type 等）を採用
 * - MP4 の互換性向上のため無音オーディオトラックを合成（Android 標準系対策）
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

  // captureStream（動画トラック）
  const baseStream: MediaStream =
    (canvas as any).captureStream?.(fps) ??
    (canvas as HTMLCanvasElement).captureStream?.(fps);
  if (!baseStream) throw new Error("Canvas.captureStream() is not supported.");

  // 端末互換の MIME を再解決（target を最優先しつつ候補から選択）
  const resolvedMime = pickMediaRecorderMime(target) ?? target;

  // ---- MP4 の互換性対策：無音オーディオトラックを合成（音声必須系プレイヤー対策）----
  let mixedStream: MediaStream = baseStream;
  let cleanupAudio: (() => void) | undefined;
  if (resolvedMime.startsWith("video/mp4")) {
    try {
      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const ac = new AC();
        // 極小音（実質無音）を発生させて MediaStream に流す
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        gain.gain.value = 0.00001; // 無音レベル
        osc.connect(gain);
        const dest = ac.createMediaStreamDestination();
        gain.connect(dest);

        // 再生系へは出さない（デバイス出力に繋がない）
        const audioTracks = dest.stream.getAudioTracks();
        mixedStream = new MediaStream([...baseStream.getVideoTracks(), ...audioTracks]);

        try { osc.start(); } catch { /* 二重 start 安全策 */ }

        cleanupAudio = () => {
          try { osc.stop(); } catch {}
          try { audioTracks.forEach(t => t.stop()); } catch {}
          try { ac.close(); } catch {}
        };
      }
    } catch {
      // 失敗しても致命ではない（音声なしで続行）
    }
  }

  // MediaRecorder 準備（ビットレートを明示）
  const options: MediaRecorderOptions = {
    mimeType: isTypeSupportedSafe(resolvedMime) ? resolvedMime : undefined,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: resolvedMime.startsWith("video/mp4") ? 128_000 : undefined,
  };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(mixedStream, options);
  } catch {
    // UA に任せる（mimeType 無指定で再トライ）
    recorder = new MediaRecorder(mixedStream);
  }

  const chunks: BlobPart[] = [];
  let detectedType: string | undefined;

  const startPromise = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("start", () => resolve());
    recorder.addEventListener("error", (e: any) => reject(e?.error ?? e));
  });

  const resultPromise = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
        if (!detectedType && ev.data.type) detectedType = ev.data.type;
      }
    });
    recorder.addEventListener("stop", () => {
      try {
        // **重要**: UA が実際に吐いた type を最優先で採用
        const effectiveType =
          detectedType ||
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

  // timeslice ありで開始（200msごとに dataavailable。mux 安定＆短尺対策）
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

  // Mux 終端安定のため 1 フレーム分待つ（最終タイムスタンプが 0 扱い防止）
  await wait(frameInterval);

  // ★停止前フラッシュ：最終チャンクを書き出させる
  try { recorder.requestData(); } catch {}
  await wait(Math.max(200, frameInterval * 2)); // flush を待つ（端末差を吸収）

  // 停止して Blob を取得
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await resultPromise;

  // クリーンアップ
  mixedStream.getTracks().forEach((t) => t.stop());
  try { cleanupAudio?.(); } catch {}

  // 極小（= ヘッダのみ/断片のみ）の検出。小さすぎる場合は上位フォールバック
  if (!blob || blob.size < MIN_VALID_SIZE) {
    throw new Error(`Recorded blob is too small (${blob?.size ?? 0} bytes).`);
  }

  return blob;
}

/* ---------------- ユーティリティ ---------------- */

// UAごとの最適候補（Androidは webm 優先、iOS/Safari 系は mp4 を含む）
// target を最優先しつつ、互換候補も試す
function pickMediaRecorderMime(target: TargetMime): string | undefined {
  const preferFirst: string[] =
    target === "video/webm"
      ? [
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8",
          "video/webm",
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2", // 最後に MP4 も試す（iOS 向け）
          "video/mp4",
        ]
      : [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/mp4",
          // Android では mp4 非対応のことがあるため WebM も候補に入れて救済
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=vp9,opus",
          "video/webm",
        ];

  for (const c of preferFirst) {
    if (isTypeSupportedSafe(c)) return c;
  }
  return undefined; // ブラウザ任せ
}

function isTypeSupportedSafe(mime: string): boolean {
  try {
    const MR: any = (window as any).MediaRecorder;
    return !!MR?.isTypeSupported?.(mime);
  } catch {
    return false;
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
