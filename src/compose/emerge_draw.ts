// src/compose/emerge_draw.ts
// 目的：emerge 演出を「フレーム配列を作らず」描画関数で逐次生成する。
// encode側はこの drawer を受け取って1枚ずつ描画→MediaRecorderへ流す。

type U8 = Uint8Array;

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("2D context unavailable");
  return { c, ctx: ctx as CanvasRenderingContext2D };
}

function rgbaFromRGB(rgb: U8, w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let i = 0, j = 0; i < w * h; i++, j += 3) {
    id.data[i * 4 + 0] = rgb[j + 0];
    id.data[i * 4 + 1] = rgb[j + 1];
    id.data[i * 4 + 2] = rgb[j + 2];
    id.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function maskCanvasFrom1ch(mask: U8, w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    const v = mask[i];
    id.data[j + 0] = 255;
    id.data[j + 1] = 255;
    id.data[j + 2] = 255;
    id.data[j + 3] = v;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function drawWithMask(ctx: CanvasRenderingContext2D, src: CanvasImageSource, mask: CanvasImageSource, w: number, h: number) {
  // tmpにmask→source-inで切り抜き
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(mask as any, 0, 0, w, h);
  tctx.globalCompositeOperation = "source-in";
  tctx.drawImage(src as any, 0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}

export type EmergeDrawer = {
  width: number;
  height: number;
  totalFrames: number;
  draw: (ctx: CanvasRenderingContext2D, frameIndex: number) => void;
};

export function buildEmergeDrawer(
  foregroundRGB: U8,
  backgroundRGB: U8,
  mask1ch: U8,
  similar: CanvasImageSource,
  width: number,
  height: number,
  durationSec: number,
  fps: number,
): EmergeDrawer {
  const fg = rgbaFromRGB(foregroundRGB, width, height);
  const bg = rgbaFromRGB(backgroundRGB, width, height);
  const alphaMask = maskCanvasFrom1ch(mask1ch, width, height);
  const total = Math.max(1, Math.round(durationSec * fps));

  return {
    width, height, totalFrames: total,
    draw: (ctx, f) => {
      const t = f / (total - 1 || 1);

      // 背景（軽いズーム）
      const bgScale = 1 + 0.05 * easeOutCubic(t);
      const bw = Math.round(width * bgScale);
      const bh = Math.round(height * bgScale);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);

      // similar の出現
      const show1 = t < 0.4 ? easeOutCubic(t / 0.4) : t < 0.6 ? 1 : 1 - easeInOutQuad((t - 0.6) / 0.4);
      const scale = 1.2 - 0.2 * show1;
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);

      // 簡易ぼかし（重ね描き）
      const passes = Math.round(3 * show1);
      for (let p = 0; p < passes; p++) {
        const dx = (width - sw) / 2 + p - passes / 2;
        const dy = (height - sh) / 2 + p - passes / 2;
        ctx.globalAlpha = 0.6 / (p + 1);
        ctx.drawImage(similar as any, dx, dy, sw, sh);
      }
      ctx.globalAlpha = 1;

      // ラジアル露出（0.4〜0.6）
      if (t >= 0.4 && t < 0.6) {
        const pr = (t - 0.4) / 0.2;
        const tmp = document.createElement("canvas");
        tmp.width = width; tmp.height = height;
        const rctx = tmp.getContext("2d")!;
        const maxR = Math.hypot(width, height) * 0.6;
        const r = maxR * easeOutCubic(pr);
        const grad = rctx.createRadialGradient(width/2, height/2, Math.max(1, r*0.2), width/2, height/2, r);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        rctx.fillStyle = grad;
        rctx.fillRect(0, 0, width, height);
        drawWithMask(ctx, similar, tmp, width, height);
      }

      // 前景＋微パララックス
      const fgAlpha = t < 0.5 ? easeInOutQuad(t / 0.5) : 1;
      ctx.globalAlpha = fgAlpha;
      ctx.save();
      const px = (t - 0.5) * 10;
      const py = (0.5 - t) * 6;
      ctx.translate(px, py);
      drawWithMask(ctx, fg, alphaMask, width, height);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  };
}
