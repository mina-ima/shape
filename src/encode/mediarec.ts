// src/encode/mediarec.ts
/* 目的: 生成済みフレーム(CanvasImageSource[])を MediaRecorder で安全に動画化
   - UIフリーズ対策: timesliceでこまめに ondataavailable、watchdogで停止漏れ検知
   - Safari/Chrome差異: mimeを呼び出し側から受け、未対応なら自動フォールバック
   - メモリ対策: OffscreenCanvas(or <canvas>) 1枚に逐次描画し captureStream する
*/

type Mime = "video/webm" | "video/mp4";

function pickSupportedMime(preferred: Mime): string {
  const cands = preferred === "video/mp4"
    ? ["video/mp4", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];
  for (const t of cands) {
    try { if ((window as any).MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; } catch {}
  }
  // どうしてもわからなければ空 → ブラウザのデフォルトに委ねる
  return "";
}

function createCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function drawToCanvas(
  c: OffscreenCanvas | HTMLCanvasElement,
  src: CanvasImageSource,
  w: number,
  h: number
): void {
  const ctx = (c as any).getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("2D context unavailable");
  // Safariで描画が詰まるケース対策: 先にクリア
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src as any, 0, 0, w, h);
}

export async function encodeWithMediaRecorder(
  frames: CanvasImageSource[],
  fps: number,
  preferred: Mime
): Promise<Blob> {
  if (!frames.length) return new Blob([], { type: preferred });

  // 基本サイズは最初のフレームから取得
  const w =
    (frames[0] as any).videoWidth ?? (frames[0] as any).naturalWidth ?? (frames[0] as any).width ?? 720;
  const h =
    (frames[0] as any).videoHeight ?? (frames[0] as any).naturalHeight ?? (frames[0] as any).height ?? 1280;

  const canvas = createCanvas(w, h);
  // captureStream は HTMLCanvasElement しかない環境もある
  let stream: MediaStream;
  if ("captureStream" in (canvas as any)) {
    stream = (canvas as any).captureStream(Math.max(1, Math.min(60, fps)));
  } else {
    // OffscreenCanvas しかない場合は、仮の <canvas> を1枚作ってミラー描画
    const mirror = document.createElement("canvas");
    mirror.width = w; mirror.height = h;
    const mirrorCtx = mirror.getContext("2d");
    if (!mirrorCtx) throw new Error("2D context unavailable");
    stream = mirror.captureStream(Math.max(1, Math.min(60, fps)));
    // ミラー更新ループ
    (async () => {
      while (true) {
        // このループは encode 中だけ走る。停止は下のフラグで制御。
        await new Promise(r => requestAnimationFrame(r));
        try {
          const ctx = (canvas as any).getContext("2d");
          if (!ctx) break;
          mirrorCtx.clearRect(0, 0, w, h);
          mirrorCtx.drawImage(canvas as any, 0, 0, w, h);
        } catch { break; }
      }
    })();
  }

  const mimeType = pickSupportedMime(preferred);
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  const chunks: BlobPart[] = [];
  let stopped = false;
  let stopReason = "normal";

  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size) chunks.push(ev.data);
  };
  rec.onerror = () => { /* onstopで扱う */ };
  rec.onstop = () => { stopped = true; };

  const timesliceMs = 1000; // 1秒ごとにデータを吐かせてUIブロック回避
  rec.start(timesliceMs);

  // 逐次描画: rAFで1フレームずつ、fps に合わせて間引き/待機
  const frameIntervalMs = 1000 / Math.max(1, fps);
  let nextAt = performance.now();

  for (let i = 0; i < frames.length; i++) {
    // UIレスポンス確保: rAF で進める
    await new Promise(requestAnimationFrame);
    const now = performance.now();
    const wait = Math.max(0, nextAt - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nextAt = performance.now() + frameIntervalMs;

    // 実描画
    drawToCanvas(canvas, frames[i], w, h);
  }

  // ★ ウォッチドッグ: onstop が飛ばないケース対策
  const expectedMs = Math.ceil((frames.length / Math.max(1, fps)) * 1000);
  const watchdog = setTimeout(() => {
    if (!stopped) {
      stopReason = "watchdog-timeout";
      try { rec.requestData(); } catch {}
      try { rec.stop(); } catch {}
    }
  }, expectedMs + 4000); // 余裕をみて +4s

  // 正常停止手順
  try { rec.requestData(); } catch {}
  try { rec.stop(); } catch {}

  // 停止待ち
  const t0 = performance.now();
  while (!stopped && performance.now() - t0 < expectedMs + 5000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  clearTimeout(watchdog);

  // ストリーム終了（端末のカメラ等に影響しないように念のため停止）
  try { stream.getTracks().forEach(tr => tr.stop()); } catch {}

  const type = mimeType || preferred;
  const blob = new Blob(chunks, { type });
  if (!blob.size) {
    throw new Error(`MediaRecorder empty blob (${stopReason})`);
  }
  return blob;
}
