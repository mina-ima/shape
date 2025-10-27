// src/encode/mediarec.ts

/**
 * MediaRecorder でフレーム配列を動画化して Blob を返す。
 * - HTMLCanvasElement.captureStream(fps) を優先（OffscreenCanvas は互換性に難があるため録画には使わない）
 * - ImageData/putImageData で 1/FPS ごとに描画し、描画フラッシュを await で担保
 * - timeslice ありで dataavailable を安定化
 * - UA が実際に吐いた MIME（dataavailable.type 等）を採用
 * - MP4 の互換性向上のため無音オーディオトラックを合成（Android 標準系対策）
 * - 出力が小さすぎる場合（<64KB）はフォールバックを促すため例外
 */

export type TargetMime = "video/webm" | "video/mp4";
const MIN_VALID_SIZE = 64 * 1024; // 64KB 未満は破損/短尺とみなす

// cv.Mat の代替（imshow に必要な情報のみ）
interface MiniMat {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function encodeWithMediaRecorder(
  frames: MiniMat[],
  fps: number,
  target: TargetMime,
): Promise<Blob> {
  if (typeof window === "undefined" || typeof (window as any).MediaRecorder !== "function") {
    throw new Error("MediaRecorder is not available.");
  }
  if (!frames?.length) throw new Error("No frames provided.");

  const width = frames[0].width | 0;
  const height = frames[0].height | 0;
  if (!width || !height) throw new Error("Invalid frame size.");

  // --- 録画用キャンバス：HTMLCanvasElement を必ず使用（互換性重視） ---
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not available");

  const resolvedMime = pickMediaRecorderMime(target) ?? target;

  // --- captureStream（動画トラック作成） ---
  const baseStream: MediaStream = (canvas as any).captureStream?.(fps) ?? canvas.captureStream();
  if (!baseStream) throw new Error("Canvas.captureStream() is not supported.");

  // ---- MP4 対策：無音オーディオトラックを合成（音声必須プレイヤー向け）----
  let mixedStream: MediaStream = baseStream;
  let cleanupAudio: (() => void) | undefined;
  if (resolvedMime.startsWith("video/mp4")) {
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const ac = new AC();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        gain.gain.value = 0.00001; // 実質無音
        osc.connect(gain);
        const dest = ac.createMediaStreamDestination();
        gain.connect(dest);
        const audioTracks = dest.stream.getAudioTracks();
        mixedStream = new MediaStream([...baseStream.getVideoTracks(), ...audioTracks]);
        try { osc.start(); } catch {}
        cleanupAudio = () => {
          try { osc.stop(); } catch {}
          try { audioTracks.forEach(t => t.stop()); } catch {}
          try { ac.close(); } catch {}
        };
      }
    } catch {
      // 音声なしでも続行
    }
  }

  // --- MediaRecorder 準備 ---
  const options: MediaRecorderOptions = {
    mimeType: isTypeSupportedSafe(resolvedMime) ? resolvedMime : undefined,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: resolvedMime.startsWith("video/mp4") ? 128_000 : undefined,
  };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(mixedStream, options);
  } catch {
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
        const effectiveType =
          detectedType ||
          (recorder as any).mimeType ||
          (options as any).mimeType ||
          target;

        resolve(new Blob(chunks, { type: effectiveType }));
      } catch (e) {
        reject(e);
      }
    });
    recorder.addEventListener("error", (e: any) => reject(e?.error ?? e));
  });

  // timeslice ありで開始（200ms ごとに dataavailable→mux 安定）
  recorder.start(200);
  await startPromise;

  // --- 描画ユーティリティ (脱-OpenCV) ---
  const drawFrame = (mat: MiniMat) => {
    // TS2769ビルドエラー対策: mat.dataがSharedArrayBufferを持つ可能性を考慮し、
    // new Uint8ClampedArray() で標準バッファにコピーしてからImageDataを生成する。
    const safeData = new Uint8ClampedArray(mat.data);
    const imageData = new ImageData(safeData, mat.width, mat.height);
    ctx.putImageData(imageData, 0, 0);
  };

  const frameInterval = Math.max(4, Math.round(1000 / Math.max(1, fps)));

  // ★ 先行フレーム：ストリームが空で始まらないように数フレーム暖機
  for (let i = 0; i < Math.min(2, frames.length); i++) {
    drawFrame(frames[i]);
    // DOM 反映フラッシュ（Android での書き込み遅延対策）
    // eslint-disable-next-line no-await-in-loop
    await flushPaint();
  }

  // --- 本描画：1/FPS ごとに 1 フレーム ---
  for (let i = 0; i < frames.length; i++) {
    drawFrame(frames[i]);
    // eslint-disable-next-line no-await-in-loop
    await wait(frameInterval);
    // 低速端末での描画取りこぼし回避（描画フラッシュ）
    // eslint-disable-next-line no-await-in-loop
    await flushPaint();
  }

  // --- 終端の“余韻フレーム”で mux の最終タイムスタンプを安定化 ---
  for (let i = 0; i < 2; i++) {
    // 最終フレームを繰り返し
    drawFrame(frames[frames.length - 1]);
    // eslint-disable-next-line no-await-in-loop
    await wait(frameInterval);
  }

  // ★停止前フラッシュ：最終チャンクを書き出させる
  try { recorder.requestData(); } catch {}
  await wait(Math.max(200, frameInterval * 2));

  // 停止して Blob を取得
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await resultPromise;

  // 後始末
  mixedStream.getTracks().forEach((t) => t.stop());
  try { cleanupAudio?.(); } catch {}

  // 小さすぎる（ヘッダのみ/断片的）場合は上位フォールバックへ
  if (!blob || blob.size < MIN_VALID_SIZE) {
    throw new Error(`Recorded blob is too small (${blob?.size ?? 0} bytes).`);
  }

  return blob;
}

/* ---------------- ユーティリティ ---------------- */

// UAごとの最適候補（Android は webm 優先、iOS/Safari 系は mp4 も）
function pickMediaRecorderMime(target: TargetMime): string | undefined {
  // MediaRecorder は実装差が大きいため、実録画は webm 優先が安定。
  // target は尊重しつつ、候補列を調整。
  const preferFirst: string[] =
    target === "video/webm"
      ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/mp4",
        ]
      : [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/mp4",
          // Android では mp4 未対応実装もあるため WebM も候補に入れる
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
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

// 描画反映を 1 フレーム遅延させる（Android でのキャンバス→トラック反映遅延に対応）
async function flushPaint(): Promise<void> {
  await new Promise<void>((r) => {
    // requestAnimationFrame を 1 回挟んでから microtask
    requestAnimationFrame(() => Promise.resolve().then(() => r()));
  });
}
