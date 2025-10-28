// src/encode/ffmpeg_loop.ts
// 単一JPEG(-loop 1)ではなく、必要に応じて全フレームPNGを書き出す版。
// UIブロック対策: 10枚ごとに小休止してメインスレッドを解放。

import { FFmpeg } from "@ffmpeg/ffmpeg";

type Mime = "video/webm" | "video/mp4";

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

async function canvasToPngBytes(src: CanvasImageSource, w: number, h: number): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(src as any, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob png failed'))), 'image/png');
  });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeWithFFmpegLoop(
  frames: CanvasImageSource[],
  fps: number,
  target: Mime,
): Promise<Blob> {
  if (!frames.length) return new Blob([], { type: target });

  const w =
    (frames[0] as any).videoWidth ?? (frames[0] as any).naturalWidth ?? (frames[0] as any).width ?? 720;
  const h =
    (frames[0] as any).videoHeight ?? (frames[0] as any).naturalHeight ?? (frames[0] as any).height ?? 1280;

  const ff = new FFmpeg();
  await ff.load();

  // フレームを書き込み（10枚ごとに小休止）
  for (let i = 0; i < frames.length; i++) {
    const png = await canvasToPngBytes(frames[i], w, h);
    const name = `frame${String(i + 1).padStart(4, "0")}.png`;
    await ff.writeFile(name, png);
    if ((i + 1) % 10 === 0) {
      // UI 応答を確保
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const out = target === "video/webm" ? "out.webm" : "out.mp4";
  const args =
    target === "video/webm"
      ? ["-framerate", String(fps), "-i", "frame%04d.png", "-c:v", "libvpx-vp8", "-pix_fmt", "yuv420p", "-b:v", "2M", "-deadline", "realtime", "-row-mt", "1", "-an", out]
      : ["-framerate", String(fps), "-i", "frame%04d.png", "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-pix_fmt", "yuv420p", "-b:v", "2M", "-maxrate", "2M", "-bufsize", "4M", "-movflags", "+faststart", "-an", out];

  await ff.exec(args);

  const u8 = (await ff.readFile(out)) as Uint8Array;
  const blob = new Blob([toArrayBuffer(u8)], { type: target });

  // 片付け（失敗しても無視）
  try {
    const files = Array.from({ length: frames.length }, (_, i) => `frame${String(i + 1).padStart(4, "0")}.png`).concat([out]);
    for (const f of files) { try { await ff.deleteFile(f); } catch {} }
  } catch {}

  return blob;
}
