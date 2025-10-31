// src/compose/emerge_draw.ts
// 目的：
//  1) 縞対策：時間変化ブルーノイズ＋粒状グレインでバンディングを実質不可視化
//  2) 動き付け：上下バウンス＋スクワッシュ&ストレッチ＋ゼリー状ゆらぎ（列スライス変形）
//  3) 明瞭化：ラジアル露出＋白縁で“キャラクター誕生”を強調、テロップ表示に対応

type U8 = Uint8Array;

export type Theme = {
  bg1: { r: number; g: number; b: number };
  bg2: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
  subjectTint: { r: number; g: number; b: number };
  /** 任意：最終テロップ */
  label?: string;
};

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t: number): number { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

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
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i]; const j = i * 4;
    id.data[j + 0] = 255; id.data[j + 1] = 255; id.data[j + 2] = 255; id.data[j + 3] = v;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function drawWithMask(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  mask: CanvasImageSource,
  w: number,
  h: number
) {
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(mask as any, 0, 0, w, h);
  tctx.globalCompositeOperation = "source-in";
  tctx.drawImage(src as any, 0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}

/* ===== 背景・アクセント・アウトライン ===== */

function fillGradient(ctx: CanvasRenderingContext2D, w: number, h: number, c1: Theme["bg1"], c2: Theme["bg2"], t: number) {
  const rot = Math.sin(t * Math.PI * 2) * 0.04;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  g.addColorStop(0, `rgb(${c1.r},${c1.g},${c1.b})`);
  g.addColorStop(1, `rgb(${c2.r},${c2.g},${c2.b})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function radialAccent(ctx: CanvasRenderingContext2D, color: Theme["accent"], strength: number) {
  if (strength <= 0) return;
  const { width: w, height: h } = ctx.canvas;
  const r = Math.hypot(w, h) * 0.5 * strength;
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
  g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0.5)`);
  g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
  ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}

function drawOutline(ctx: CanvasRenderingContext2D, alphaMask: HTMLCanvasElement, color = "white", widthPx = 4, shadowPx = 8, shadowAlpha = 0.28) {
  const { width: w, height: h } = ctx.canvas;
  const edge = document.createElement("canvas"); edge.width = w; edge.height = h;
  const ectx = edge.getContext("2d")!;
  ectx.drawImage(alphaMask, 0, 0);
  ectx.globalCompositeOperation = "destination-out";
  ectx.filter = `blur(${widthPx}px)`; ectx.drawImage(alphaMask, 0, 0);
  ectx.filter = "none"; ectx.globalCompositeOperation = "source-over";
  // 影
  if (shadowPx > 0 && shadowAlpha > 0) {
    ctx.save(); ctx.globalAlpha = shadowAlpha; ctx.filter = `blur(${shadowPx}px)`; ctx.drawImage(edge, 0, 0); ctx.filter = "none"; ctx.restore();
  }
  // 白縁
  ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.fillStyle = color; ctx.drawImage(edge, 0, 0); ctx.restore();
}

/* ===== ノイズ（縞抑制）：ブルーノイズ+時間変化 ===== */

// xorshift風
function prng(seed: number) { let x = seed | 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 0xffffffff; }; }

/** 背景用の細粒グレイン（毎フレームパターン更新） */
function makeGrain(w: number, h: number, t: number, alpha = 0.05): HTMLCanvasElement {
  const rnd = prng(12345 + Math.floor(t * 10007));
  const { c, ctx } = makeCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 200 + Math.floor(rnd() * 55);
    id.data[i*4+0] = v; id.data[i*4+1] = v; id.data[i*4+2] = v; id.data[i*4+3] = Math.round(alpha*255);
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/** 露出用ラジアルマスクに加える“青寄りノイズ”でバンディング打ち消し */
function makeBlueishNoise(w: number, h: number, t: number, alpha = 0.10): HTMLCanvasElement {
  const rnd = prng(98765 + Math.floor(t * 9973));
  const { c, ctx } = makeCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 低周波＋擬似ブルーノイズ
      const n = (Math.sin((x*1.7 + y*2.1) * 0.06 + t*6.28) + Math.cos((x*3.3 - y*1.4) * 0.045 - t*3.14)) * 0.25 + (rnd()-0.5)*0.5;
      const v = Math.max(0, Math.min(255, 230 + n*25));
      const i = (y*w + x) * 4;
      id.data[i+0] = v; id.data[i+1] = v; id.data[i+2] = v; id.data[i+3] = Math.round(alpha*255);
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/* ===== ラジアル露出（中心＝マスク重心） ===== */

function maskMoments(mask: U8, w: number, h: number) {
  let m00=0, m10=0, m01=0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = mask[y*w+x]/255; m00+=a; m10+=x*a; m01+=y*a; }
  const cx = m00>1e-6 ? m10/m00 : w/2, cy = m00>1e-6 ? m01/m00 : h/2;
  return { cx, cy };
}

function buildRadialRevealMask(baseAlphaMask: HTMLCanvasElement, w: number, h: number, cx: number, cy: number, progress01: number, t: number): HTMLCanvasElement {
  const p = Math.min(1, Math.max(0, progress01));
  const Rmax = Math.hypot(Math.max(cx, w-cx), Math.max(cy, h-cy));
  const R = Math.max(1, Rmax * p);

  const { c: grad, ctx: gctx } = makeCanvas(w, h);
  const g = gctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  gctx.fillStyle = g; gctx.fillRect(0,0,w,h);

  // ノイズを“screen”で重ねて段差を消す
  gctx.globalCompositeOperation = "screen";
  gctx.drawImage(makeBlueishNoise(w, h, t, 0.10 + 0.05*p), 0, 0);
  gctx.globalCompositeOperation = "source-over";

  // baseAlpha と AND
  const { c: out, ctx: octx } = makeCanvas(w, h);
  octx.drawImage(grad, 0, 0);
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(baseAlphaMask, 0, 0);
  octx.globalCompositeOperation = "source-over";
  return out;
}

/* ===== 事前ポスタライズ（イラスト寄せ） ===== */

function posterizeFromImage(src: CanvasImageSource, w: number, h: number, levels = 6): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(w, h);
  ctx.drawImage(src as any, 0, 0, w, h);
  const img = ctx.getImageData(0,0,w,h);
  const step = 255 / Math.max(1, levels - 1);
  for (let i=0; i<img.data.length; i+=4) {
    img.data[i+0] = Math.round(Math.round(img.data[i+0] / step) * step);
    img.data[i+1] = Math.round(Math.round(img.data[i+1] / step) * step);
    img.data[i+2] = Math.round(Math.round(img.data[i+2] / step) * step);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ===== 動き付け：ゼリー状ゆらぎ（列スライス変形） ===== */
/** キャラの“中身”にだけ、列ごとにわずかなyオフセットと伸縮を与える */
function drawJellyDeform(
  dstCtx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  mask: HTMLCanvasElement,
  w: number,
  h: number,
  t: number,          // 0..1 時間
  intensity = 0.015,  // ゆらぎ強度（比率）
  columns = 24        // スライス数
) {
  const sliceW = Math.max(1, Math.floor(w / columns));
  // マスクでクリップ（キャラ内部のみ適用）
  dstCtx.save();
  dstCtx.drawImage(mask, 0, 0);
  dstCtx.globalCompositeOperation = "source-in";

  for (let x = 0; x < w; x += sliceW) {
    const u = x / w;
    const phase = Math.sin((u * 6.283) + t * 6.283 * 0.8) * 0.5 + Math.cos((u * 10.0) - t * 6.283 * 0.6) * 0.5;
    const yOff = Math.round(h * intensity * phase);              // 縦ゆらぎ
    const scaleY = 1 + intensity * 0.8 * Math.sin(u * 12 + t*8); // 伸縮
    const sx = x, sw = Math.min(sliceW, w - x);
    const dh = Math.round(h * scaleY);
    const dy = Math.round((h - dh) / 2) + yOff;
    dstCtx.drawImage(src as any, sx, 0, sw, h, sx, dy, sw, dh);
  }
  dstCtx.restore();
}

/* ===== 公開API ===== */

export type EmergeDrawer = {
  width: number;
  height: number;
  totalFrames: number;
  draw: (ctx: CanvasRenderingContext2D, frameIndex: number) => void;
};

export function buildEmergeDrawer(
  foregroundRGB: U8,
  backgroundRGB: U8, // 互換のみ（未使用）
  mask1ch: U8,
  similar: CanvasImageSource,
  width: number,
  height: number,
  durationSec: number,
  fps: number,
  theme?: Theme,
): EmergeDrawer {
  const fg = rgbaFromRGB(foregroundRGB, width, height);
  const alphaMask = maskCanvasFrom1ch(mask1ch, width, height);
  const total = Math.max(1, Math.round(durationSec * fps));

  const useTheme = !!theme;
  const fallbackBg1 = { r: 240, g: 245, b: 255 };
  const fallbackBg2 = { r: 255, g: 252, b: 240 };
  const fallbackAccent = { r: 255, g: 170, b: 220 };
  const fallbackTint = { r: 255, g: 240, b: 255 };
  const bg1 = useTheme ? theme!.bg1 : fallbackBg1;
  const bg2 = useTheme ? theme!.bg2 : fallbackBg2;
  const accent = useTheme ? theme!.accent : fallbackAccent;
  const tint = useTheme ? theme!.subjectTint : fallbackTint;
  const label = theme?.label ?? "Cartoon Character";

  const poster = posterizeFromImage(similar, width, height, 6);
  const { cx, cy } = maskMoments(mask1ch, width, height);

  return {
    width, height, totalFrames: total,
    draw: (ctx, f) => {
      const t = f / (total - 1 || 1);

      // 背景：明るいグラデ + アクセント + 粒状グレイン（縞抑制）
      ctx.clearRect(0, 0, width, height);
      fillGradient(ctx, width, height, bg1, bg2, t);
      radialAccent(ctx, accent, easeOutCubic(t) * 0.6);
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.drawImage(makeGrain(width, height, t, 0.05), 0, 0);
      ctx.restore();

      // タイムライン
      const p1 = Math.min(1, t / 0.25);                       // 0–25%：シルエット誕生
      const p2 = t <= 0.25 ? 0 : Math.min(1, (t-0.25)/0.35);  // 25–60%：本体化
      const p3 = t <= 0.60 ? 0 : Math.min(1, (t-0.60)/0.40);  // 60–100%：仕上げ

      // ラジアル露出：ノイズ合成でバンディング不可視化
      const revealMask = buildRadialRevealMask(alphaMask, width, height, cx, cy, easeInOutQuad(Math.max(p1, p2)), t);

      // グローバル動き（上下バウンス＋微回転＋スクワッシュ）
      const bounce = easeOutBack(Math.min(1, t));            // 最初の出現時に強め
      const bobY = Math.sin(t * 6.283 * 0.8) * Math.min(6, height * 0.01);
      const rot = Math.sin(t * 6.283 * 0.3) * 0.03;          // ±約1.7°
      const squash = 1 + 0.05 * Math.sin(t * 6.283 * 0.6);   // スクワッシュ&ストレッチ

      // 1) パステル・シルエット（誕生）
      const sil = document.createElement("canvas"); sil.width = width; sil.height = height;
      const sctx = sil.getContext("2d")!;
      sctx.save();
      sctx.translate(width/2, height/2 + bobY * (1 - p2));
      sctx.rotate(rot * (1 - p2));
      sctx.scale(1 / Math.sqrt(squash), Math.sqrt(squash));   // 体積保存風
      sctx.translate(-width/2, -height/2);
      sctx.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
      sctx.fillRect(0, 0, width, height);
      drawWithMask(sctx, sctx.canvas, alphaMask, width, height);
      sctx.restore();
      drawWithMask(ctx, sil, revealMask, width, height);

      // 2) イラスト本体（ポスタライズ）＋ゼリー状ゆらぎ
      const body = document.createElement("canvas"); body.width = width; body.height = height;
      const bctx = body.getContext("2d")!;
      // ゼリー変形はキャラ内部のみ
      bctx.save();
      bctx.translate(width/2, height/2 + bobY);
      bctx.rotate(rot);
      bctx.scale(1 / Math.sqrt(squash), Math.sqrt(squash));
      bctx.translate(-width/2, -height/2);
      drawJellyDeform(bctx, poster, alphaMask, width, height, t, 0.015, 24);
      bctx.restore();

      // 本体はシルエットからクロスフェード
      ctx.save();
      ctx.globalAlpha = p2;
      drawWithMask(ctx, body, revealMask, width, height);
      ctx.restore();

      // 3) 本人味：元画像（前景）を弱めに
      if (p3 > 0) {
        const fgTmp = document.createElement("canvas"); fgTmp.width = width; fgTmp.height = height;
        const fctx = fgTmp.getContext("2d")!;
        fctx.save();
        fctx.translate(width/2, height/2 + bobY);
        fctx.rotate(rot);
        fctx.scale(1 / Math.sqrt(squash), Math.sqrt(squash));
        fctx.translate(-width/2, -height/2);
        drawWithMask(fctx, fg, alphaMask, width, height);
        fctx.restore();
        ctx.save(); ctx.globalAlpha = 0.22 * p3; ctx.drawImage(fgTmp, 0, 0); ctx.restore();
      }

      // 縁取り（終盤強め）
      drawOutline(ctx, alphaMask, "white", 4, 8, 0.20 + 0.25 * p3);

      // テロップ
      if (p3 > 0.2 && label) {
        ctx.save();
        const a = Math.min(1, (p3 - 0.2) / 0.4);
        ctx.globalAlpha = a;
        ctx.font = `bold ${Math.round(Math.max(20, width * 0.06))}px system-ui, -apple-system, Roboto, "Helvetica Neue", Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineWidth = 8; ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.strokeText(label, width/2, height - 24);
        ctx.fillStyle = "rgba(30,30,30,0.95)";
        ctx.fillText(label, width/2, height - 24);
        ctx.restore();
      }
    }
  };
}
