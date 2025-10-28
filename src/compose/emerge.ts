// src/compose/emerge.ts
/* “出現（emerge）”合成
 *  - base: 撮影画像の被写体（foreground）をマスクで抽出
 *  - seed: ネットから取得した類似画像（similar）
 *  - 1→2秒: similar をぼかし + 拡大縮小でゆっくり表示開始
 *  - 2→3秒: マスクに沿って中心から露出（radial mask）
 *  - 3→5秒: 被写体にクロスフェードしながら軽いパララックス
 *  出力: CanvasImageSource[]（各フレームは Canvas）
 */

type U8 = Uint8Array;

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function createCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2D context unavailable');
  return { c, ctx };
}

function makeRadialMask(w: number, h: number, progress: number): HTMLCanvasElement {
  const { c, ctx } = createCanvas(w, h);
  const maxR = Math.hypot(w, h) * 0.6;
  const r = maxR * progress;
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.max(1, r * 0.2), w / 2, h / 2, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function makeMaskFromAlpha(mask1ch: U8, w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = createCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let i = 0, j = 0; i < mask1ch.length; i++, j += 4) {
    const v = mask1ch[i];
    id.data[j + 0] = 255;
    id.data[j + 1] = 255;
    id.data[j + 2] = 255;
    id.data[j + 3] = v;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function drawWithMask(ctx: CanvasRenderingContext2D, src: CanvasImageSource, mask: CanvasImageSource, w: number, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  // マスク適用: ctx.drawImage(mask) → src atop
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d')!;
  tctx.drawImage(mask as any, 0, 0, w, h);
  tctx.globalCompositeOperation = 'source-in';
  tctx.drawImage(src as any, 0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

export async function generateEmergeFrames(
  foregroundRGB: U8, // 3ch packed
  backgroundRGB: U8, // 3ch packed
  mask1ch: U8,       // 0..255
  similar: CanvasImageSource,
  width: number,
  height: number,
  durationSec: number,
  fps: number,
): Promise<HTMLCanvasElement[]> {
  const frames: HTMLCanvasElement[] = [];
  const total = Math.max(1, Math.round(durationSec * fps));

  // 素材を CanvasImageSource に
  const fgCanvas = (() => {
    const { c, ctx } = createCanvas(width, height);
    const id = ctx.createImageData(width, height);
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
      id.data[i * 4 + 0] = foregroundRGB[j + 0];
      id.data[i * 4 + 1] = foregroundRGB[j + 1];
      id.data[i * 4 + 2] = foregroundRGB[j + 2];
      id.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  })();

  const bgCanvas = (() => {
    const { c, ctx } = createCanvas(width, height);
    const id = ctx.createImageData(width, height);
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
      id.data[i * 4 + 0] = backgroundRGB[j + 0];
      id.data[i * 4 + 1] = backgroundRGB[j + 1];
      id.data[i * 4 + 2] = backgroundRGB[j + 2];
      id.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  })();

  const alphaMask = makeMaskFromAlpha(mask1ch, width, height);

  for (let f = 0; f < total; f++) {
    const t = f / (total - 1 || 1);
    const { c, ctx } = createCanvas(width, height);

    // 背景（軽いズーム）
    const bgScale = 1 + 0.05 * easeOutCubic(t);
    const bw = Math.round(width * bgScale);
    const bh = Math.round(height * bgScale);
    ctx.drawImage(bgCanvas, (width - bw) / 2, (height - bh) / 2, bw, bh);

    // similar の出現: 0.0→0.4 でぼかし＋拡大、0.4→0.6 でラジアルマスク、0.6→1.0 でフェードアウト
    const show1 = t < 0.4 ? easeOutCubic(t / 0.4) : t < 0.6 ? 1 : 1 - easeInOutQuad((t - 0.6) / 0.4);
    const scale = 1.2 - 0.2 * show1;
    const sw = Math.round(width * scale);
    const sh = Math.round(height * scale);

    // 軽いブラー（Canvas 簡易: 連続描画）
    const passes = Math.round(3 * show1);
    for (let p = 0; p < passes; p++) {
      const dx = (width - sw) / 2 + p - passes / 2;
      const dy = (height - sh) / 2 + p - passes / 2;
      ctx.globalAlpha = 0.6 / (p + 1);
      ctx.drawImage(similar as any, dx, dy, sw, sh);
    }
    ctx.globalAlpha = 1.0;

    // ラジアルマスクで露出
    if (t >= 0.4 && t < 0.6) {
      const pr = (t - 0.4) / 0.2;
      const radial = makeRadialMask(width, height, easeOutCubic(pr));
      drawWithMask(ctx, similar, radial, width, height);
    }

    // 前景（被写体）フェードイン + 微小パララックス
    const fgAlpha = t < 0.5 ? easeInOutQuad(t / 0.5) : 1;
    ctx.globalAlpha = fgAlpha;
    ctx.save();
    const px = (t - 0.5) * 10; // ささやかな平行移動
    const py = (0.5 - t) * 6;
    ctx.translate(px, py);
    drawWithMask(ctx, fgCanvas, alphaMask, width, height);
    ctx.restore();
    ctx.globalAlpha = 1.0;

    frames.push(c);
  }

  return frames;
}
