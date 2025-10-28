// src/encode/mediarec.ts
// 既存の encodeWithMediaRecorder(frames) に加えて、draw関数から逐次生成する encodeWithMediaRecorderDraw を追加。

type Mime = "video/webm" | "video/mp4";

function pickSupportedMime(preferred: Mime): string {
  const cands = preferred === "video/mp4"
    ? ["video/mp4", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];
  for (const t of cands) try { if ((window as any).MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; } catch {}
  return "";
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export async function encodeWithMediaRecorder(
  frames: CanvasImageSource[],
  fps: number,
  preferred: Mime
): Promise<Blob> {
  // 互換のため残しておく（従来版）
  return encodeWithMediaRecorderDraw({
    width:
      (frames[0] as any).videoWidth ?? (frames[0] as any).naturalWidth ?? (frames[0] as any).width ?? 720,
    height:
      (frames[0] as any).videoHeight ?? (frames[0] as any).naturalHeight ?? (frames[0] as any).height ?? 1280,
    total: frames.length,
    async draw(ctx, i) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.drawImage(frames[i] as any, 0, 0, ctx.canvas.width, ctx.canvas.height); }
  }, fps, preferred);
}

export async function encodeWithMediaRecorderDraw(
  drawer: { width: number; height: number; total: number; draw: (ctx: CanvasRenderingContext2D, index: number) => void | Promise<void> },
  fps: number,
  preferred: Mime
): Promise<Blob> {
  const w = drawer.width, h = drawer.height;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  const stream = canvas.captureStream(Math.max(1, Math.min(60, fps)));
  const mimeType = pickSupportedMime(preferred);
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  const chunks: BlobPart[] = [];
  let stopped = false;
  let stopReason = "normal";

  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  rec.onstop = () => { stopped = true; };

  rec.start(1000); // 1s ごとにチャンク化

  const frameIntervalMs = 1000 / Math.max(1, fps);
  let nextAt = performance.now();

  for (let i = 0; i < drawer.total; i++) {
    await new Promise(requestAnimationFrame);
    const now = performance.now();
    const wait = Math.max(0, nextAt - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    nextAt = performance.now() + frameIntervalMs;

    await drawer.draw(ctx, i);
  }

  const expectedMs = Math.ceil((drawer.total / Math.max(1, fps)) * 1000);
  const watchdog = setTimeout(() => {
    if (!stopped) {
      stopReason = "watchdog-timeout";
      try { rec.requestData(); } catch {}
      try { rec.stop(); } catch {}
    }
  }, expectedMs + 4000);

  try { rec.requestData(); } catch {}
  try { rec.stop(); } catch {}

  const t0 = performance.now();
  while (!stopped && performance.now() - t0 < expectedMs + 5000) {
    await new Promise(r => setTimeout(r, 50));
  }
  clearTimeout(watchdog);

  try { stream.getTracks().forEach(tr => tr.stop()); } catch {}

  const type = mimeType || preferred;
  const blob = new Blob(chunks, { type });
  if (!blob.size) throw new Error(`MediaRecorder empty blob (${stopReason})`);
  return blob;
}
