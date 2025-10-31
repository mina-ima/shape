// src/compose/emerge_draw.ts
// ポップ＆明瞭化版：時間変化ノイズで縞抑制 + 白縁アウトライン + 軽いバウンス

type U8 = Uint8Array;

export type Theme = {
  bg1: { r: number; g: number; b: number };
  bg2: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
  subjectTint: { r: number; g: number; b: number };
};

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t: number): number {
  // バウンス感のある緩和
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

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
    const v = mask[i];
    const j = i * 4;
    id.data[j + 0] = 255;
    id.data[j + 1] = 255;
    id.data[j + 2] = 255;
    id.data[j + 3] = v;
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
  // mask → source-in
  tctx.drawImage(mask as any, 0, 0, w, h);
  tctx.globalCompositeOperation = "source-in";
  tctx.drawImage(src as any, 0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}

/* ================== 色・背景 ================== */

function fillGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c1: Theme["bg1"],
  c2: Theme["bg2"],
  t: number
) {
  const rot = Math.sin(t * Math.PI * 2) * 0.04; // ±約2.3°
  const g = ctx.createLinearGradient(0, 0, 0, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);

  g.addColorStop(0, `rgb(${c1.r},${c1.g},${c1.b})`);
  g.addColorStop(1, `rgb(${c2.r},${c2.g},${c2.b})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

function applyTint(ctx: CanvasRenderingContext2D, color: Theme["subjectTint"], alpha = 0.30) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // 明るく寄せる：screen を採用（白地や淡色でも潰れにくい）
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function radialAccent(ctx: CanvasRenderingContext2D, color: Theme["accent"], strength: number) {
  if (strength <= 0) return;
  const { width: w, height: h } = ctx.canvas;
  const r = Math.hypot(w, h) * 0.5 * strength;
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
  g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0.5)`);
  g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ================== ノイズ（縞抑制：時間変化） ================== */

// 簡易PRNG（xorshift32風）
function pseudoRandom(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

// フレーム進行 t (0..1) をシードに反映して毎フレーム異なるノイズにする
function makeTemporalNoise(w: number, h: number, t: number, alpha = 0.08): HTMLCanvasElement {
  const rnd = pseudoRandom(Math.floor(t * 9973) + 12345);
  const { c, ctx } = makeCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // ブルーノイズっぽく：周波数ミックス＋ランダム
      const n =
        rnd() * 0.5 +
        Math.sin((x * 1.7 + y * 2.3) * 0.07 + t * 6.28) * 0.25 +
        Math.cos((x * 3.1 - y * 1.9) * 0.033 - t * 3.14) * 0.25;
      const v = 200 + Math.max(0, Math.min(1, 0.5 + n)) * 55;
      const i = (y * w + x) * 4;
      id.data[i + 0] = v;
      id.data[i + 1] = v;
      id.data[i + 2] = v;
      id.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/* ================== 形状（主軸）＆マスク生成 ================== */

/** マスク(8bit)の一次/二次モーメントから主軸角度(ラジアン)を概算 */
function principalAxisAngle(mask: U8, w: number, h: number): number {
  let m00 = 0, m10 = 0, m01 = 0, m20 = 0, m02 = 0, m11 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = mask[y * w + x] / 255; m00 += a; m10 += x * a; m01 += y * a; m20 += x * x * a; m02 += y * y * a; m11 += x * y * a;
  }
  if (m00 <= 1e-6) return 0;
  const cx = m10 / m00, cy = m01 / m00;
  const mu20 = m20 / m00 - cx * cx;
  const mu02 = m02 / m00 - cy * cy;
  const mu11 = m11 / m00 - cx * cy;
  return 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
}

/**
 * 有機的な露出マスクを作る。
 * - ベース：baseAlpha をブラー → エッジから内側へ“にじむ”露出
 * - ディザ：時間変化ノイズを加えてバンディング（縞）を抑制
 * - 向き：主軸方向へわずかに引っ張る（線形ワイプ代替）
 */
function buildOrganicRevealMask(
  baseAlphaMask: HTMLCanvasElement,
  w: number,
  h: number,
  angleRad: number,
  progress01: number, // 0..1
  t: number           // 0..1（フレーム進行）
): HTMLCanvasElement {
  const p = Math.min(1, Math.max(0, progress01));

  // 1) baseAlpha のソフト化（ブラー量を進行で増やす）
  const { c: soft, ctx: sctx } = makeCanvas(w, h);
  sctx.save();
  const blurPx = 2 + 24 * p; // 2px → 26px
  sctx.filter = `blur(${blurPx}px)`;
  sctx.drawImage(baseAlphaMask, 0, 0);
  sctx.restore();

  // 2) 主軸方向のごく緩い明度バイアス
  const { c: dir, ctx: dctx } = makeCanvas(w, h);
  dctx.save();
  dctx.translate(w / 2, h / 2);
  dctx.rotate(angleRad);
  dctx.translate(-w / 2, -h / 2);
  const g = dctx.createLinearGradient(0, 0, w, 0);
  const left = Math.max(0, 0.35 - 0.25 * p), right = Math.min(1, 0.65 + 0.25 * p);
  g.addColorStop(0, `rgba(255,255,255,${left})`);
  g.addColorStop(1, `rgba(255,255,255,${right})`);
  dctx.fillStyle = g;
  dctx.fillRect(0, 0, w, h);
  dctx.restore();

  // 3) 時間変化ノイズ（テンポラル・ディザ）
  const noise = makeTemporalNoise(w, h, t, 0.06 + 0.06 * p);

  // 4) 合成：soft ∩ baseAlpha ＋ dir ＋ noise
  const { c: out, ctx: octx } = makeCanvas(w, h);
  octx.drawImage(soft, 0, 0);
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(baseAlphaMask, 0, 0);
  octx.globalCompositeOperation = "lighter";
  octx.globalAlpha = 0.45 + 0.35 * p;
  octx.drawImage(dir, 0, 0);
  octx.globalAlpha = 1;
  octx.drawImage(noise, 0, 0);
  octx.globalCompositeOperation = "source-over";
  return out;
}

/* ================== アウトライン（白縁＋影） ================== */

function drawOutline(
  ctx: CanvasRenderingContext2D,
  alphaMask: HTMLCanvasElement,
  color = "white",
  widthPx = 3,
  shadowPx = 6,
  shadowAlpha = 0.25
) {
  const { width: w, height: h } = ctx.canvas;

  // エッジ抽出：mask - blur(mask)
  const edge = document.createElement("canvas");
  edge.width = w; edge.height = h;
  const ectx = edge.getContext("2d")!;
  ectx.drawImage(alphaMask, 0, 0);
  ectx.globalCompositeOperation = "destination-out";
  ectx.filter = `blur(${widthPx}px)`;
  ectx.drawImage(alphaMask, 0, 0);
  ectx.filter = "none";
  ectx.globalCompositeOperation = "source-over";

  // 影
  if (shadowPx > 0 && shadowAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = shadowAlpha;
    ctx.filter = `blur(${shadowPx}px)`;
    ctx.drawImage(edge, 0, 0);
    ctx.filter = "none";
    ctx.restore();
  }

  // 白縁
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = color;
  ctx.drawImage(edge, 0, 0);
  ctx.restore();
}

/* ================== 公開API ================== */

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
  theme?: Theme,
): EmergeDrawer {
  const fg = rgbaFromRGB(foregroundRGB, width, height);
  const bg = rgbaFromRGB(backgroundRGB, width, height); // 参照は残す（未描画）
  const alphaMask = maskCanvasFrom1ch(mask1ch, width, height);
  const total = Math.max(1, Math.round(durationSec * fps));

  const useTheme = !!theme;
  // 明るいパステル基調（ポップ寄せ）
  const fallbackBg1 = { r: 240, g: 245, b: 255 };
  const fallbackBg2 = { r: 255, g: 252, b: 240 };
  const fallbackAccent = { r: 255, g: 170, b: 220 };
  const fallbackTint = { r: 255, g: 255, b: 255 };

  // 主軸角度
  const angle = principalAxisAngle(mask1ch, width, height);

  return {
    width, height, totalFrames: total,
    draw: (ctx, f) => {
      const t = f / (total - 1 || 1);

      // 背景（色グラデ＋軽いズーム）
      const bgScale = 1 + 0.05 * easeOutCubic(t);
      const bw = Math.round(width * bgScale);
      const bh = Math.round(height * bgScale);
      ctx.clearRect(0, 0, width, height);

      const bg1 = useTheme ? theme!.bg1 : fallbackBg1;
      const bg2 = useTheme ? theme!.bg2 : fallbackBg2;
      const accent = useTheme ? theme!.accent : fallbackAccent;
      const tint = useTheme ? theme!.subjectTint : fallbackTint;

      fillGradient(ctx, width, height, bg1, bg2, t);
      // 黒基調の背景画像は描画しない（暗さ回避）
      // ctx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);
      radialAccent(ctx, accent, easeOutCubic(t) * 0.6);

      // 露出マスク（縞抑制：時間変化ノイズ）
      const show = t < 0.55 ? easeInOutQuad(t / 0.55) : 1;
      const revealMask = buildOrganicRevealMask(alphaMask, width, height, angle, show, t);

      // 類似画像（軽いバウンス動作）
      const bounce = t < 0.7 ? easeOutBack(Math.min(1, t / 0.7)) : 1 - 0.08 * (t - 0.7) / 0.3;
      const scale = 1.08 - 0.08 * bounce;
      const rot = (bounce - 1) * 0.03; // ±約1.7°
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);

      const tmp = document.createElement("canvas");
      tmp.width = width; tmp.height = height;
      const sctx = tmp.getContext("2d")!;
      sctx.save();
      sctx.translate(width / 2, height / 2);
      sctx.rotate(rot);
      sctx.translate(-width / 2, -height / 2);
      sctx.drawImage(similar as any, (width - sw) / 2, (height - sh) / 2, sw, sh);
      sctx.restore();
      // 合成は screen。強すぎる白潰れを避けるため α をやや低めに
      applyTint(sctx, tint, 0.22 + 0.18 * show);

      drawWithMask(ctx, tmp, revealMask, width, height);

      // 前景（被写体の元画像）を重ねて“本人味”を残す
      const fgAlpha = t < 0.5 ? easeInOutQuad(t / 0.5) * 0.7 : 0.7 + 0.3 * (t - 0.5) * 2;
      ctx.globalAlpha = Math.min(1, fgAlpha);
      ctx.save();
      const px = (t - 0.5) * 8;   // 微パララックス
      const py = (0.5 - t) * 5;
      ctx.translate(px, py);
      drawWithMask(ctx, fg, alphaMask, width, height);
      ctx.restore();
      ctx.globalAlpha = 1;

      // 輪郭アウトライン（白縁＋ソフトシャドウ）
      drawOutline(ctx, alphaMask, "white", 3, 6, 0.25);
    }
  };
}
