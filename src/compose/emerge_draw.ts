// src/compose/emerge_draw.ts
// 目的：元画像のニュアンス（色・質感）を残しつつ、similar画像から“生まれてくる”演出を逐次描画。
// 変更点：
// - 背景に元画像の強ブラー版を使用（色の雰囲気をキープ）
// - マスク内で similar と元画像をクロスフェード
// - Theme があれば背景グラデ＆アクセント光を追加し、素材色に追従
// - 既存互換：Theme/元画像なしでも従来どおり動作

type U8 = Uint8Array;

export type Theme = {
  /** 背景グラデーション上部の色 */
  bg1: { r: number; g: number; b: number };
  /** 背景グラデーション下部の色 */
  bg2: { r: number; g: number; b: number };
  /** ラジアルの光（screen 合成） */
  accent: { r: number; g: number; b: number };
  /** 類似画像へ乗せるティント（overlay） */
  subjectTint: { r: number; g: number; b: number };
};

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
  // tmpにmask→source-inで切り抜き
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(mask as any, 0, 0, w, h);
  tctx.globalCompositeOperation = "source-in";
  tctx.drawImage(src as any, 0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}

/* --------- 色テーマ向けの軽量描画ユーティリティ --------- */

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

function applyTint(ctx: CanvasRenderingContext2D, color: Theme["subjectTint"], alpha = 0.35) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
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

/* --------- 元画像ブラー（縮小→拡大で軽量疑似ブラー） --------- */
function makeBlurredFrom(canvasSrc: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const s = 0.1; // 10%まで縮小
  const sw = Math.max(1, Math.round(w * s));
  const sh = Math.max(1, Math.round(h * s));

  const { c: small, ctx: sctx } = makeCanvas(sw, sh);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "low";
  sctx.drawImage(canvasSrc as any, 0, 0, sw, sh);

  const { c: big, ctx: bctx } = makeCanvas(w, h);
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, w, h);
  return big;
}

/* --------- 公開API --------- */

export type EmergeDrawer = {
  width: number;
  height: number;
  totalFrames: number;
  draw: (ctx: CanvasRenderingContext2D, frameIndex: number) => void;
};

/**
 * @param originalRGB  元画像のRGB(3ch)。省略可。渡すと色・質感の反映が強くなる。
 */
export function buildEmergeDrawer(
  foregroundRGB: U8,
  backgroundRGB: U8,
  mask1ch: U8,
  similar: CanvasImageSource,
  width: number,
  height: number,
  durationSec: number,
  fps: number,
  theme?: Theme,       // 色テーマ（省略可）
  originalRGB?: U8,    // ★ 追加：元画像RGB（省略可）
): EmergeDrawer {
  const fg = rgbaFromRGB(foregroundRGB, width, height);
  const bg = rgbaFromRGB(backgroundRGB, width, height);
  const alphaMask = maskCanvasFrom1ch(mask1ch, width, height);
  const total = Math.max(1, Math.round(durationSec * fps));

  // 元画像キャンバス（ある場合）
  const srcCanvas = originalRGB ? rgbaFromRGB(originalRGB, width, height) : fg;
  const blurredSrc = makeBlurredFrom(srcCanvas, width, height);

  // テーマが無い場合も動くようフォールバック色を用意
  const fallbackBg1 = { r: 10, g: 10, b: 14 };
  const fallbackBg2 = { r: 38, g: 38, b: 46 };
  const fallbackAccent = { r: 120, g: 170, b: 255 };
  const fallbackTint = { r: 255, g: 255, b: 255 };

  return {
    width, height, totalFrames: total,
    draw: (ctx, f) => {
      const t = f / (total - 1 || 1);

      // ===== 背景：元画像ブラーをベースに、（あれば）テーマグラデ＆光を重畳 =====
      const bgScale = 1 + 0.04 * easeOutCubic(t);
      const bw = Math.round(width * bgScale);
      const bh = Math.round(height * bgScale);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(blurredSrc, (width - bw) / 2, (height - bh) / 2, bw, bh);

      if (theme) {
        ctx.globalAlpha = 0.65; // 元画像色を活かしつつグラデを乗せる
        fillGradient(ctx, width, height, theme.bg1, theme.bg2, t);
        ctx.globalAlpha = 1;
        radialAccent(ctx, theme.accent, 0.5 * easeOutCubic(t));
      } else {
        ctx.globalAlpha = 0.4;
        fillGradient(ctx, width, height, fallbackBg1, fallbackBg2, t);
        ctx.globalAlpha = 1;
        radialAccent(ctx, fallbackAccent, 0.25 * easeOutCubic(t));
      }

      // ===== similar の出現（ティント付） → 元画像とのクロスフェード =====
      const phaseIn = t < 0.4 ? easeOutCubic(t / 0.4) : 1;
      const phaseHold = t >= 0.4 && t < 0.7 ? 1 : 0;
      const phaseOut = t >= 0.7 ? 1 - easeInOutQuad((t - 0.7) / 0.3) : 1;
      const simStrength = Math.max(0, Math.min(1, 0.85 * phaseIn * (phaseHold ? 1 : phaseOut)));

      const scale = 1.15 - 0.15 * simStrength;
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);

      const tmpSim = document.createElement("canvas");
      tmpSim.width = width; tmpSim.height = height;
      const sctx = tmpSim.getContext("2d")!;
      sctx.drawImage(similar as any, (width - sw) / 2, (height - sh) / 2, sw, sh);
      applyTint(sctx, (theme ? theme.subjectTint : fallbackTint), 0.25 + 0.35 * simStrength);

      // 柔らかい“滲み”表現（重ね描き）
      const passes = 2 + Math.round(2 * simStrength);
      for (let p = 0; p < passes; p++) {
        const dx = (p - passes / 2), dy = (p - passes / 2);
        ctx.globalAlpha = 0.5 / (p + 1);
        drawWithMask(ctx, tmpSim, alphaMask, width, height);
        ctx.globalAlpha = 1;
      }

      // ===== 元画像（オリジナル）をマスク内に少しずつ戻す（クロスフェード）=====
      const origStrength = Math.max(0, Math.min(1, 1 - simStrength)); // 逆相
      if (originalRGB && origStrength > 0.02) {
        const tmpOrig = document.createElement("canvas");
        tmpOrig.width = width; tmpOrig.height = height;
        const octx = tmpOrig.getContext("2d")!;
        octx.drawImage(srcCanvas, 0, 0, width, height);
        // 見た目強調：微量スクリーンで持ち上げ
        octx.globalAlpha = 0.15 * origStrength;
        octx.globalCompositeOperation = "screen";
        octx.fillStyle = "white";
        octx.fillRect(0, 0, width, height);
        octx.globalAlpha = 1;
        octx.globalCompositeOperation = "source-over";

        ctx.globalAlpha = Math.min(0.9, 0.4 + 0.6 * origStrength);
        drawWithMask(ctx, tmpOrig, alphaMask, width, height);
        ctx.globalAlpha = 1;
      }

      // ===== 切り抜き前景（fg）を最終的にのせる：被写体の存在感を固定 =====
      const fgAlpha = t < 0.5 ? easeInOutQuad(t / 0.5) : 1;
      ctx.globalAlpha = fgAlpha;
      ctx.save();
      const px = (t - 0.5) * 8;
      const py = (0.5 - t) * 5;
      ctx.translate(px, py);
      drawWithMask(ctx, fg, alphaMask, width, height);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  };
}
