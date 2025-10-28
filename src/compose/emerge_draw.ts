// src/compose/emerge_draw.ts
// 目的：emerge 演出を「フレーム配列を作らず」描画関数で逐次生成する。
// encode側はこの drawer を受け取って1枚ずつ描画→MediaRecorderへ流す。
// 追加：Theme（色テーマ）に対応。未指定なら従来の見た目で動作。

type U8 = Uint8Array;

export type Theme = {
  /** 背景グラデーション上部の色 */
  bg1: { r: number; g: number; b: number };
  /** 背景グラデーション下部の色 */
  bg2: { r: number; g: number; b: number };
  /** ラジアルの光（スクリーン合成） */
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

/** 背景グラデ（わずかに回転させて静的に見せない） */
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

/** 類似画像にティント(overlay)を掛ける */
function applyTint(ctx: CanvasRenderingContext2D, color: Theme["subjectTint"], alpha = 0.35) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** ラジアルの光（screen合成） */
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

/* --------- 公開API --------- */

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
  theme?: Theme, // ★ 追加：色テーマ（省略可）
): EmergeDrawer {
  const fg = rgbaFromRGB(foregroundRGB, width, height);
  const bg = rgbaFromRGB(backgroundRGB, width, height);
  const alphaMask = maskCanvasFrom1ch(mask1ch, width, height);
  const total = Math.max(1, Math.round(durationSec * fps));

  // テーマが無い場合は従来動作／ある場合は色反映
  const useTheme = !!theme;

  // デフォルト（テーマが無いとき用）の下地色
  const fallbackBg1 = { r: 10, g: 10, b: 14 };
  const fallbackBg2 = { r: 38, g: 38, b: 46 };
  const fallbackAccent = { r: 120, g: 170, b: 255 };
  const fallbackTint = { r: 255, g: 255, b: 255 };

  return {
    width, height, totalFrames: total,
    draw: (ctx, f) => {
      const t = f / (total - 1 || 1);

      // 背景（色グラデ＋軽いズーム）
      const bgScale = 1 + 0.05 * easeOutCubic(t);
      const bw = Math.round(width * bgScale);
      const bh = Math.round(height * bgScale);

      ctx.clearRect(0, 0, width, height);

      if (useTheme) {
        // テーマあり：背景グラデーション＋アクセント光
        fillGradient(ctx, width, height, theme!.bg1, theme!.bg2, t);
        ctx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);
        radialAccent(ctx, theme!.accent, easeOutCubic(t) * 0.6);
      } else {
        // テーマなし：従来どおり（グラデ薄めの代替）
        fillGradient(ctx, width, height, fallbackBg1, fallbackBg2, t);
        ctx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);
        radialAccent(ctx, fallbackAccent, easeOutCubic(t) * 0.3);
      }

      // similar の出現（ティント付与）
      const show1 = t < 0.4 ? easeOutCubic(t / 0.4) : t < 0.6 ? 1 : 1 - easeInOutQuad((t - 0.6) / 0.4);
      const scale = 1.2 - 0.2 * show1;
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);

      const tmp = document.createElement("canvas");
      tmp.width = width; tmp.height = height;
      const sctx = tmp.getContext("2d")!;
      sctx.drawImage(similar as any, (width - sw) / 2, (height - sh) / 2, sw, sh);
      // ティント（テーマがあればそれを、無ければ白系薄め）
      const tintColor = useTheme ? theme!.subjectTint : fallbackTint;
      applyTint(sctx, tintColor, 0.35 + 0.25 * show1);

      // 簡易ぼかし（重ね描き）
      const passes = Math.round(2 + 2 * show1);
      for (let p = 0; p < passes; p++) {
        const dx = p - passes / 2;
        const dy = p - passes / 2;
        ctx.globalAlpha = 0.6 / (p + 1);
        ctx.drawImage(tmp, dx, dy);
      }
      ctx.globalAlpha = 1;

      // ラジアル露出（0.4〜0.6）
      if (t >= 0.4 && t < 0.6) {
        const pr = (t - 0.4) / 0.2;
        const mask = document.createElement("canvas");
        mask.width = width; mask.height = height;
        const mctx = mask.getContext("2d")!;
        const maxR = Math.hypot(width, height) * 0.6;
        const r = maxR * easeOutCubic(pr);
        const grad = mctx.createRadialGradient(
          width / 2, height / 2, Math.max(1, r * 0.2),
          width / 2, height / 2, r
        );
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        mctx.fillStyle = grad;
        mctx.fillRect(0, 0, width, height);
        drawWithMask(ctx, tmp, mask, width, height);
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
