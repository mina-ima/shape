// src/compose/emerge_draw.ts
// 目的：emerge 演出をフレーム配列なしで逐次描画。
// 変更点：
//  - 被写体マスクの主軸（PCA的モーメント）に沿った線形ワイプで「輪郭→中身」へ露出
//  - 類似画像は常にマスク内でのみ露出（輪郭優先の時間制御）→縞模様を排除
//  - Theme色で背景グラデ/スクリーン光/ティントを適用（未指定ならフォールバック）
//
// 依存なし（ローカル実装）。encode側は従来どおり drawer.draw を呼ぶだけ。

type U8 = Uint8Array;

export type Theme = {
  bg1: { r: number; g: number; b: number };
  bg2: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
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
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  // mask → source-in
  tctx.drawImage(mask as any, 0, 0, w, h);
  tctx.globalCompositeOperation = "source-in";
  tctx.drawImage(src as any, 0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}

/* ================== 色と背景ユーティリティ ================== */

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

/* ================== 形状（主軸）ユーティリティ ================== */

/** マスク(8bit)の一次/二次モーメントから主軸角度(ラジアン)を概算 */
function principalAxisAngle(mask: U8, w: number, h: number): number {
  let m00 = 0, m10 = 0, m01 = 0, m20 = 0, m02 = 0, m11 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = mask[y * w + x] / 255; // 0..1
      m00 += a;
      m10 += x * a;
      m01 += y * a;
      m20 += x * x * a;
      m02 += y * y * a;
      m11 += x * y * a;
    }
  }
  if (m00 <= 1e-6) return 0;
  const cx = m10 / m00;
  const cy = m01 / m00;
  const mu20 = m20 / m00 - cx * cx;
  const mu02 = m02 / m00 - cy * cy;
  const mu11 = m11 / m00 - cx * cy;
  // 主軸の角度（-pi/2..pi/2）
  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  return theta;
}

/** 主軸方向に沿った線形ワイプ用の 0..1 マスクを作る（mask と AND される） */
function buildDirectionalWipeMask(
  baseAlphaMask: HTMLCanvasElement,
  w: number,
  h: number,
  angleRad: number,
  progress01: number, // 0..1 で露出進行
  edgeBias = 0.25 // 序盤は輪郭を優先して出す
): HTMLCanvasElement {
  // 1) 線形グラデ（angle 方向に進行）
  const { c: grad, ctx: gctx } = makeCanvas(w, h);
  gctx.save();
  gctx.translate(w / 2, h / 2);
  gctx.rotate(angleRad);
  gctx.translate(-w / 2, -h / 2);

  const g = gctx.createLinearGradient(0, 0, w, 0);
  const p = Math.min(1, Math.max(0, progress01));
  // 端から p まで白（表示）、残り透明（未表示）
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(p, "rgba(255,255,255,1)");
  g.addColorStop(p, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  gctx.fillStyle = g;
  gctx.fillRect(0, 0, w, h);
  gctx.restore();

  // 2) 輪郭優先：外周を強めるため baseAlpha の縁を抽出→ぼかして加算
  const edge = document.createElement("canvas");
  edge.width = w; edge.height = h;
  const ectx = edge.getContext("2d")!;
  ectx.drawImage(baseAlphaMask, 0, 0);
  // 内側を少し細らせる（擬似エッジ）
  ectx.globalCompositeOperation = "destination-out";
  ectx.filter = "blur(3px)";
  ectx.drawImage(baseAlphaMask, 0, 0);
  ectx.filter = "none";
  // エッジを薄白で
  ectx.globalCompositeOperation = "source-over";
  ectx.globalAlpha = 0.8;
  ectx.drawImage(edge, 0, 0);

  // 3) grad と edge を合成（加算）→ 0..1 の露出マップ
  const add = document.createElement("canvas");
  add.width = w; add.height = h;
  const actx = add.getContext("2d")!;
  actx.drawImage(grad, 0, 0);
  actx.globalAlpha = edgeBias; // 序盤ほど輪郭寄り
  actx.globalCompositeOperation = "lighter";
  actx.drawImage(edge, 0, 0);
  actx.globalCompositeOperation = "source-over";
  actx.globalAlpha = 1;

  // 4) baseAlphaMask と AND（dest-in）
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const octx = out.getContext("2d")!;
  octx.drawImage(add, 0, 0);
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(baseAlphaMask, 0, 0);

  return out;
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
  const bg = rgbaFromRGB(backgroundRGB, width, height);
  const alphaMask = maskCanvasFrom1ch(mask1ch, width, height);
  const total = Math.max(1, Math.round(durationSec * fps));

  const useTheme = !!theme;
  // 明るいパステル基調（ポップ寄せ）
  const fallbackBg1 = { r: 240, g: 245, b: 255 };
  const fallbackBg2 = { r: 255, g: 252, b: 240 };
  const fallbackAccent = { r: 255, g: 170, b: 220 };
  const fallbackTint = { r: 255, g: 255, b: 255 };

  // 主軸角度（マスク配列から事前計算）
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
      // 黒ベースの背景画像は暗くなるため描画しない（グラデ主体）
      // ctx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);
      radialAccent(ctx, accent, easeOutCubic(t) * 0.6);

      // 類似画像の“形状に沿った”露出
      // 早めに全体像を見せて“お化け感”を減らす
      const show = t < 0.5 ? easeInOutQuad(t / 0.5) : 1;
      const edgeBias = (1 - Math.min(1, t / 0.5)) * 0.18 + 0.06;
      const revealMask = buildDirectionalWipeMask(alphaMask, width, height, angle, show, edgeBias);

      // 類似画像はマスク内のみ。ティントを掛けて色を寄せる。
      const tmp = document.createElement("canvas");
      tmp.width = width; tmp.height = height;
      const sctx = tmp.getContext("2d")!;
      // 微ズーム（定着後は 1.0 へ）
      const scale = 1.1 - 0.1 * show;
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);
      sctx.drawImage(similar as any, (width - sw) / 2, (height - sh) / 2, sw, sh);
      // 合成は screen。強すぎる白潰れを避けるため α をやや低めに
      applyTint(sctx, tint, 0.22 + 0.18 * show);

      drawWithMask(ctx, tmp, revealMask, width, height);

      // 前景（被写体の元画像）を後半で重ねて“本人味”を残す
      const fgAlpha = t < 0.5 ? easeInOutQuad(t / 0.5) * 0.6 : 0.6 + 0.4 * (t - 0.5) * 2;
      ctx.globalAlpha = Math.min(1, fgAlpha);
      ctx.save();
      const px = (t - 0.5) * 8;   // 微パララックス
      const py = (0.5 - t) * 5;
      ctx.translate(px, py);
      drawWithMask(ctx, fg, alphaMask, width, height);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  };
}
