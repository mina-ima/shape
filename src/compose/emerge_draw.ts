// src/compose/emerge_draw.ts
// 目的：縦シマ根絶（列スライス/固定パターン撤廃）＋「元画像が手前に飛び出す」演出
//      - 主役：元画像の前景（切り抜き）
//      - Zモーション：ポップイン→前進→小さく揺れる（パース/影/ハイライト）
//      - 縞対策：時間変化ブルーノイズを背景/被写体に重畳（overlay/screen）

type U8 = Uint8Array;

export type Theme = {
  bg1: { r: number; g: number; b: number };
  bg2: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
  subjectTint: { r: number; g: number; b: number };
  label?: string;
};

function clamp01(x: number) { return Math.min(1, Math.max(0, x)); }
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t: number): number { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

/* ============== Canvas helpers ============== */

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

/* ============== 背景／アクセント／縁取り ============== */

function fillGradient(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  c1: Theme["bg1"], c2: Theme["bg2"], t: number
) {
  const rot = Math.sin(t * Math.PI * 2) * 0.045;
  const scale = 1 + 0.015 * Math.sin(t * Math.PI * 2 + 1.2);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
  g.addColorStop(0, `rgb(${c1.r},${c1.g},${c1.b})`);
  g.addColorStop(1, `rgb(${c2.r},${c2.g},${c2.b})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function radialAccent(ctx: CanvasRenderingContext2D, color: Theme["accent"], strength: number) {
  if (strength <= 0) return;
  const { width: w, height: h } = ctx.canvas;
  const r = Math.hypot(w, h) * 0.45 * strength;
  const g = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, r);
  g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0.55)`);
  g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawOutline(
  ctx: CanvasRenderingContext2D, alphaMask: HTMLCanvasElement,
  color = "white", widthPx = 4, shadowPx = 10, shadowAlpha = 0.28
) {
  const { width: w, height: h } = ctx.canvas;
  const edge = document.createElement("canvas");
  edge.width = w; edge.height = h;
  const ectx = edge.getContext("2d")!;
  ectx.drawImage(alphaMask, 0, 0);
  ectx.globalCompositeOperation = "destination-out";
  ectx.filter = `blur(${widthPx}px)`;
  ectx.drawImage(alphaMask, 0, 0);
  ectx.filter = "none";
  ectx.globalCompositeOperation = "source-over";

  // 影（輪郭の外側に柔らかく）
  if (shadowPx > 0 && shadowAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = shadowAlpha;
    ctx.filter = `blur(${shadowPx}px)`;
    ctx.drawImage(edge, 0, 0);
    ctx.filter = "none";
    ctx.restore();
  }

  // 白縁（screen）
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = color;
  ctx.drawImage(edge, 0, 0);
  ctx.restore();
}

/* ============== ノイズ（縞対策の核：時間変化ブルーノイズ） ============== */

// xorshift風PRNG
function prng(seed: number) { let x = seed | 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 0xffffffff; }; }

function makeBlueishNoise(w: number, h: number, t: number, alpha = 0.08): HTMLCanvasElement {
  const rnd = prng(98765 + Math.floor(t * 9973));
  const { c, ctx } = makeCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 異方性で縦方向に依らないよう、xyミックス＋時間位相
      const n = (Math.sin((x*1.7 + y*2.3) * 0.065 + t*6.2) +
                 Math.cos((x*3.6 - y*1.8) * 0.042 - t*3.3)) * 0.25 + (rnd()-0.5)*0.5;
      const v = Math.max(0, Math.min(255, 230 + n*28));
      const i = (y*w + x) * 4;
      id.data[i+0] = v; id.data[i+1] = v; id.data[i+2] = v; id.data[i+3] = Math.round(alpha*255);
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function overlayGrain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, alpha = 0.06) {
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  const n1 = makeBlueishNoise(w, h, t * 0.97 + 1.3, alpha);
  const n2 = makeBlueishNoise(Math.ceil(w/2), Math.ceil(h/2), t * 1.31 + 3.7, alpha * 0.75);
  ctx.drawImage(n1, 0, 0);
  ctx.drawImage(n2, 0, 0, w, h);
  ctx.restore();
}

function screenGrain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, alpha = 0.06) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const n = makeBlueishNoise(w, h, t * 1.11 + 2.2, alpha);
  ctx.drawImage(n, 0, 0);
  ctx.restore();
}

/* ============== 形状の重心（影の基準） ============== */

function maskCenter(mask: U8, w: number, h: number) {
  let m00=0, m10=0, m01=0;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const a = mask[y*w+x]/255; m00+=a; m10+=x*a; m01+=y*a;
  }
  const cx = m00>1e-6 ? m10/m00 : w/2, cy = m00>1e-6 ? m01/m00 : h/2;
  return { cx, cy };
}

/* ============== 公開API ============== */

export type EmergeDrawer = {
  width: number;
  height: number;
  totalFrames: number;
  draw: (ctx: CanvasRenderingContext2D, frameIndex: number) => void;
};

export function buildEmergeDrawer(
  foregroundRGB: U8,
  backgroundRGB: U8, // 未使用（互換）
  mask1ch: U8,
  similar: CanvasImageSource, // 色味テクスチャ用（主役ではない）
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
  const fallbackTint = { r: 255, g: 255, b: 255 };
  const bg1 = useTheme ? theme!.bg1 : fallbackBg1;
  const bg2 = useTheme ? theme!.bg2 : fallbackBg2;
  const accent = useTheme ? theme!.accent : fallbackAccent;
  const tint = useTheme ? theme!.subjectTint : fallbackTint;
  const label = theme?.label ?? "";

  // 類似画像から“やわらかな色味レイヤ”を用意（30%だけ混ぜる）
  const { c: simCan, ctx: simCtx } = makeCanvas(width, height);
  simCtx.drawImage(similar as any, 0, 0, width, height);

  return {
    width, height, totalFrames: total,
    draw: (ctx, f) => {
      const t = f / (total - 1 || 1);

      // 背景：グラデ＋アクセント＋時間変化ノイズ（縞を流す）
      ctx.clearRect(0, 0, width, height);
      fillGradient(ctx, width, height, bg1, bg2, t);
      radialAccent(ctx, accent, easeOutCubic(t) * 0.55);
      overlayGrain(ctx, width, height, t, 0.06);

      // タイムライン（飛び出し）
      const appear = clamp01(t / 0.18);                // 0–0.18：ポンッと出る
      const advance = t < 0.18 ? 0 : clamp01((t-0.18)/0.42); // 0.18–0.60：前進
      const finish  = t < 0.60 ? 0 : clamp01((t-0.60)/0.40); // 0.60–1.00：仕上げ

      // 背景パララックス（主役が前へ出るのに合わせて背景をわずかに逆移動）
      const bgTx = Math.sin(t * 6.283 * 0.18) * Math.min(8, width * 0.01) * advance;
      const bgTy = Math.cos(t * 6.283 * 0.21) * Math.min(8, height * 0.01) * advance;
      ctx.save();
      ctx.translate(-bgTx, -bgTy);
      overlayGrain(ctx, width, height, t + 0.33, 0.04);
      ctx.restore();

      // 主役（元画像前景）の“Z方向”表現
      const popScale = t < 0.18 ? (0.85 + 0.30 * easeOutBack(appear)) : (1.05 + 0.15 * easeOutCubic(advance) - 0.05 * finish);
      const rot =  (0.03 * Math.sin(t * 6.283 * 0.35)) * (0.6 + 0.4 * advance);
      const skewX = 0.10 * easeInOutQuad(advance) * Math.sin(t * 6.283 * 0.5); // パース風（shear）
      const bobY  = Math.sin(t * 6.283 * 0.8) * Math.min(6, height * 0.01);
      const alpha = t < 0.18 ? easeOutCubic(appear) : 1;

      // 分離影（地面に落ちる影の疑似表現）
      const { cx, cy } = maskCenter(mask1ch, width, height);
      const shadow = document.createElement("canvas"); shadow.width = width; shadow.height = height;
      const sh = shadow.getContext("2d")!;
      sh.save();
      const shScale = 1.0 - 0.15 * advance; // 前進ほど影が締まる
      const shOffsetX = (cx - width/2) * 0.02 * (0.3 + 0.7 * advance);
      const shOffsetY = Math.max(6, height * 0.02) * (0.4 + 0.6 * advance);
      sh.filter = `blur(${12 - 6 * advance}px)`;
      sh.globalAlpha = 0.35 - 0.15 * advance;
      sh.translate(shOffsetX, shOffsetY);
      sh.scale(shScale, shScale * (0.85 + 0.15 * (1 - advance))); // 潰れ気味
      sh.drawImage(alphaMask, 0, 0);
      sh.restore();

      // 被写体ベース（元画像前景）
      const base = document.createElement("canvas"); base.width = width; base.height = height;
      const bctx = base.getContext("2d")!;
      drawWithMask(bctx, fg, alphaMask, width, height);

      // 類似画像からの色味（淡く重ねる）＋ハイライト
      const colorTex = document.createElement("canvas"); colorTex.width = width; colorTex.height = height;
      const cctx = colorTex.getContext("2d")!;
      cctx.drawImage(simCan, 0, 0);
      // 被写体の色に寄せる：tintをscreenで
      cctx.save();
      cctx.globalCompositeOperation = "screen";
      cctx.globalAlpha = 0.25;
      cctx.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
      cctx.fillRect(0, 0, width, height);
      cctx.restore();
      // マスク適用
      const colorMasked = document.createElement("canvas"); colorMasked.width = width; colorMasked.height = height;
      const cm = colorMasked.getContext("2d")!;
      drawWithMask(cm, colorTex, alphaMask, width, height);

      // 合成：影→被写体（元画像）→色味テクスチャ（30%）→ハイライト粒子
      const subject = document.createElement("canvas"); subject.width = width; subject.height = height;
      const sctx = subject.getContext("2d")!;
      // 影
      sctx.save();
      sctx.globalCompositeOperation = "multiply";
      sctx.drawImage(shadow, 0, 0);
      sctx.restore();
      // 元画像（メイン）
      sctx.drawImage(base, 0, 0);
      // 色味を薄く（30%）
      sctx.save();
      sctx.globalAlpha = 0.30;
      sctx.drawImage(colorMasked, 0, 0);
      sctx.restore();
      // 被写体にも微細グレイン（screen）で縞消し
      screenGrain(sctx, width, height, t + 0.57, 0.05);

      // 変換して描画（ポップイン→前進→落ち着き）
      ctx.save();
      ctx.translate(width/2, height/2 + bobY);
      // shearを含む行列（a,c にskewX反映）
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const a =  cos + skewX * -sin;
      const b =  sin;
      const c =  -sin + skewX * -cos;
      const d =  cos;
      ctx.transform(a * popScale, b * popScale, c * popScale, d * popScale, 0, 0);
      ctx.translate(-width/2, -height/2);
      ctx.globalAlpha = alpha;
      ctx.drawImage(subject, 0, 0);
      ctx.restore();

      // 縁取り（後半で少し強め）
      drawOutline(ctx, alphaMask, "white", 4, 10, 0.22 + 0.18 * finish);

      // 仕上げの粒子（ごく薄い星屑）
      ctx.save();
      ctx.globalAlpha = 0.10 * finish;
      screenGrain(ctx, width, height, t * 1.7 + 1.1, 0.08);
      ctx.restore();

      // テロップ（必要なら）
      if (finish > 0.25 && label) {
        ctx.save();
        const aL = Math.min(1, (finish - 0.25) / 0.4);
        ctx.globalAlpha = aL;
        ctx.font = `bold ${Math.round(Math.max(18, width * 0.055))}px system-ui, -apple-system, Roboto, "Helvetica Neue", Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineWidth = 8; ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.strokeText(label, width/2, height - 22);
        ctx.fillStyle = "rgba(30,30,30,0.95)";
        ctx.fillText(label, width/2, height - 22);
        ctx.restore();
      }
    }
  };
}
