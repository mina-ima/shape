// src/compose/emerge_draw.ts
// 目的：雲拡散の見え方を廃止 → ステッカーポップイン + キャラ的な動き（瞬き/スマイル/手フリ）
//       縞は従来の多層ノイズ＆有序ディザで抑制したまま

type U8 = Uint8Array;

export type Theme = {
  bg1: { r: number; g: number; b: number };
  bg2: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
  subjectTint: { r: number; g: number; b: number };
  label?: string;
};

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t: number): number { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function clamp01(x: number) { return Math.min(1, Math.max(0, x)); }

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

/* ============== 背景・アクセント・アウトライン ============== */

function fillGradient(ctx: CanvasRenderingContext2D, w: number, h: number, c1: Theme["bg1"], c2: Theme["bg2"], t: number) {
  // わずかな回転と拡大で固定的なバンドを回避
  const rot = Math.sin(t * Math.PI * 2) * 0.04;
  const scale = 1 + 0.02 * Math.sin(t * Math.PI * 2);
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
  const r = Math.hypot(w, h) * 0.5 * strength;
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
  g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0.5)`);
  g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
  ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}

function drawOutline(ctx: CanvasRenderingContext2D, alphaMask: HTMLCanvasElement, color = "white", widthPx = 4, shadowPx = 8, shadowAlpha = 0.3) {
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

/* ============== ノイズ／ディザ（縞対策の維持） ============== */

// xorshift風PRNG
function prng(seed: number) { let x = seed | 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 0xffffffff; }; }

/** 背景グレイン（毎フレーム更新・2レイヤ） */
function drawLayeredGrain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, a1 = 0.06, a2 = 0.045) {
  const { c: g1 } = makeNoiseLayer(w, h, t * 0.97 + 12.3, a1, 1.0);
  const { c: g2 } = makeNoiseLayer(Math.ceil(w/2), Math.ceil(h/2), t * 1.31 + 3.7, a2, 1.0);
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(g1, 0, 0);
  ctx.drawImage(g2, 0, 0, w, h);
  ctx.restore();
}

function makeNoiseLayer(w: number, h: number, t: number, alpha = 0.06, bias = 1.0) {
  const rnd = prng(12345 + Math.floor(t * 10007));
  const { c, ctx } = makeCanvas(w, h);
  const id = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 200 + Math.floor(rnd() * 55 * bias);
    id.data[i*4+0] = v; id.data[i*4+1] = v; id.data[i*4+2] = v; id.data[i*4+3] = Math.round(alpha*255);
  }
  ctx.putImageData(id, 0, 0);
  return { c, ctx };
}

/** Bayer 8×8（0..63） */
const BAYER8: number[] = [
   0,48,12,60, 3,51,15,63,
  32,16,44,28,35,19,47,31,
   8,56, 4,52,11,59, 7,55,
  40,24,36,20,43,27,39,23,
   2,50,14,62, 1,49,13,61,
  34,18,46,30,33,17,45,29,
  10,58, 6,54, 9,57, 5,53,
  42,26,38,22,41,25,37,21,
];

/** 有序ディザ付きポスタライズ */
function posterizeOrderedDither(src: CanvasImageSource, w: number, h: number, levels = 6): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(w, h);
  ctx.drawImage(src as any, 0, 0, w, h);
  const img = ctx.getImageData(0,0,w,h);
  const step = 255 / Math.max(1, levels - 1);
  for (let y=0; y<h; y++) {
    for (let x=0; x<w; x++) {
      const i = (y*w + x) * 4;
      const b = BAYER8[(y & 7) * 8 + (x & 7)] / 64 - 0.5; // -0.5..+0.5
      const d = b * step * 0.7;
      for (let cidx = 0; cidx < 3; cidx++) {
        const v = img.data[i + cidx] + d;
        const q = Math.round(Math.max(0, Math.min(255, v)) / step);
        img.data[i + cidx] = Math.round(q * step);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ============== マスクの重心・バウンディング ============== */

function maskStats(mask: U8, w: number, h: number) {
  let m00=0, m10=0, m01=0, minX=w, maxX=0, minY=h, maxY=0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = mask[y*w+x];
    if (a > 0) { if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y; }
    const af = a / 255; m00+=af; m10+=x*af; m01+=y*af;
  }
  const cx = m00>1e-6 ? m10/m00 : w/2, cy = m00>1e-6 ? m01/m00 : h/2;
  return { cx, cy, minX, maxX, minY, maxY };
}

/* ============== “顔”＆“手”の簡易オーバーレイ（マスク内のみ） ============== */
/** 目の瞬き：0..1に対して上下に閉じる係数（周期的に瞬き） */
function blinkAmount(t: number): number {
  // 周期約1.8秒で瞬き（2回に1回はダブルブリンク）
  const s = t * 1.1; // 周波数
  const tri = 1 - Math.abs((s % 1) * 2 - 1); // 0..1..0
  const dbl = (Math.sin(t * 6.283 * 0.27) > 0.65) ? 0.6 : 0; // たまに追加閉眼
  return clamp01(tri * 0.9 + dbl);
}

function drawKawaiiFace(
  dstCtx: CanvasRenderingContext2D,
  alphaMask: HTMLCanvasElement,
  w: number, h: number,
  bbox: {minX:number;maxX:number;minY:number;maxY:number;cx:number;cy:number},
  t: number,
  tint: Theme["subjectTint"]
) {
  const face = document.createElement("canvas"); face.width = w; face.height = h;
  const fctx = face.getContext("2d")!;

  const bw = bbox.maxX - bbox.minX + 1;
  const bh = bbox.maxY - bbox.minY + 1;
  const eyeRadius = Math.max(4, Math.min(bw, bh) * 0.04);
  const eyeY = bbox.cy - bh * 0.10;
  const eyeDX = Math.max(eyeRadius*3, bw * 0.18);
  const mouthY = bbox.cy + bh * 0.06;
  const blink = blinkAmount(t);

  // 目（黒丸→瞬きで縦縮小）
  fctx.save();
  fctx.fillStyle = "rgba(30,30,30,0.95)";
  // 左目
  fctx.save();
  fctx.translate(bbox.cx - eyeDX, eyeY);
  fctx.scale(1, 1 - 0.85 * blink); // 縦縮小で瞬き
  fctx.beginPath(); fctx.arc(0, 0, eyeRadius, 0, Math.PI*2); fctx.fill();
  fctx.restore();
  // 右目
  fctx.save();
  fctx.translate(bbox.cx + eyeDX, eyeY);
  fctx.scale(1, 1 - 0.85 * blink);
  fctx.beginPath(); fctx.arc(0, 0, eyeRadius, 0, Math.PI*2); fctx.fill();
  fctx.restore();

  // ハイライト（白）— 目の上部に小さく
  fctx.fillStyle = "rgba(255,255,255,0.85)";
  fctx.beginPath(); fctx.arc(bbox.cx - eyeDX - eyeRadius*0.3, eyeY - eyeRadius*0.3, eyeRadius*0.35, 0, Math.PI*2); fctx.fill();
  fctx.beginPath(); fctx.arc(bbox.cx + eyeDX - eyeRadius*0.3, eyeY - eyeRadius*0.3, eyeRadius*0.35, 0, Math.PI*2); fctx.fill();

  // 口（スマイル）— クォード曲線
  fctx.lineWidth = Math.max(2, eyeRadius * 0.5);
  fctx.strokeStyle = "rgba(30,30,30,0.9)";
  const mouthW = bw * 0.22;
  fctx.beginPath();
  fctx.moveTo(bbox.cx - mouthW, mouthY);
  fctx.quadraticCurveTo(bbox.cx, mouthY + bh * 0.08, bbox.cx + mouthW, mouthY);
  fctx.stroke();

  // ほっぺ（ティントカラー）
  fctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},0.35)`;
  const cheekR = eyeRadius * 0.9;
  fctx.beginPath(); fctx.arc(bbox.cx - eyeDX*1.05, mouthY - cheekR*0.3, cheekR, 0, Math.PI*2); fctx.fill();
  fctx.beginPath(); fctx.arc(bbox.cx + eyeDX*1.05, mouthY - cheekR*0.3, cheekR, 0, Math.PI*2); fctx.fill();

  fctx.restore();

  // “手フリ”：右側に丸い手を作って上下に
  const hand = document.createElement("canvas"); hand.width = w; hand.height = h;
  const hctx = hand.getContext("2d")!;
  const handR = Math.max(5, Math.min(bw,bh) * 0.05);
  const handX = bbox.maxX - handR*0.8;
  const handY0 = bbox.minY + bh * 0.35;
  const handY = handY0 + Math.sin(t * 6.283 * 1.2) * handR * 0.6;
  // 手の本体
  hctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},0.85)`;
  hctx.beginPath(); hctx.arc(handX, handY, handR, 0, Math.PI*2); hctx.fill();
  // 手の縁取り
  hctx.lineWidth = Math.max(1.5, handR*0.25);
  hctx.strokeStyle = "rgba(255,255,255,0.9)";
  hctx.stroke();

  // マスク内に限定して合成
  drawWithMask(dstCtx, face, alphaMask, w, h);
  drawWithMask(dstCtx, hand, alphaMask, w, h);
}

/* ============== グローバル動き & ゼリーゆらぎ（列スライス） ============== */

function drawJellyDeform(
  dstCtx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  mask: HTMLCanvasElement,
  w: number,
  h: number,
  t: number,
  intensity = 0.015,
  columns = 24
) {
  const sliceW = Math.max(1, Math.floor(w / columns));
  dstCtx.save();
  dstCtx.drawImage(mask, 0, 0);
  dstCtx.globalCompositeOperation = "source-in";
  for (let x = 0; x < w; x += sliceW) {
    const u = x / w;
    const phase = Math.sin((u * 6.283) + t * 6.283 * 0.8) * 0.5 + Math.cos((u * 10.0) - t * 6.283 * 0.6) * 0.5;
    const yOff = Math.round(h * intensity * phase);
    const scaleY = 1 + intensity * 0.8 * Math.sin(u * 12 + t*8);
    const sx = x, sw = Math.min(sliceW, w - x);
    const dh = Math.round(h * scaleY);
    const dy = Math.round((h - dh) / 2) + yOff;
    dstCtx.drawImage(src as any, sx, 0, sw, h, sx, dy, sw, dh);
  }
  dstCtx.restore();
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

  // ディザ付きのイラスト寄せ本体
  const poster = posterizeOrderedDither(similar, width, height, 6);

  // マスク重心・BBox（顔/手の配置に使用）
  const { cx, cy, minX, maxX, minY, maxY } = maskStats(mask1ch, width, height);

  return {
    width, height, totalFrames: total,
    draw: (ctx, f) => {
      const t = f / (total - 1 || 1);

      // 背景：グラデ＋アクセント＋多層グレイン（縞対策）
      ctx.clearRect(0, 0, width, height);
      fillGradient(ctx, width, height, bg1, bg2, t);
      radialAccent(ctx, accent, easeOutCubic(t) * 0.6);
      drawLayeredGrain(ctx, width, height, t, 0.06, 0.045);

      // タイムライン（“雲拡散”を廃止してポップイン）
      const appear = clamp01(t / 0.18);          // 0–0.18sで出現
      const settle = t < 0.18 ? 0 : clamp01((t - 0.18) / 0.32); // 0.18–0.5sで定着
      const finish = t < 0.5 ? 0 : clamp01((t - 0.5) / 0.5);    // 0.5–1で仕上げ

      // 全体の動き（上下バウンス＋微回転＋スクワッシュ）
      const bobY = Math.sin((0.5 + t) * 6.283 * 0.8) * Math.min(6, height * 0.01);
      const rot = Math.sin(t * 6.283 * 0.3) * 0.03;
      const squash = 1 + 0.05 * Math.sin(t * 6.283 * 0.6);

      // ステッカー“ポン”効果（小→大→落ち着く）
      const popScale = t < 0.18 ? (0.85 + 0.25 * easeOutBack(appear)) : (1.03 - 0.03 * easeInOutQuad(settle));
      const popAlpha = t < 0.18 ? easeOutCubic(appear) : 1;

      // 1) パステル・シルエット（ベース色）
      const sil = document.createElement("canvas"); sil.width = width; sil.height = height;
      const sctx = sil.getContext("2d")!;
      sctx.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
      sctx.fillRect(0, 0, width, height);
      // マスクで切り抜き
      const silMasked = document.createElement("canvas"); silMasked.width = width; silMasked.height = height;
      const sm = silMasked.getContext("2d")!;
      drawWithMask(sm, sil, alphaMask, width, height);

      // 2) イラスト本体（ディザ済）＋ゼリーゆらぎ
      const body = document.createElement("canvas"); body.width = width; body.height = height;
      const bctx = body.getContext("2d")!;
      drawJellyDeform(bctx, poster, alphaMask, width, height, t, 0.015, 24);

      // 3) 顔 & 手（キャラ性）
      const faceAndHand = document.createElement("canvas"); faceAndHand.width = width; faceAndHand.height = height;
      const fh = faceAndHand.getContext("2d")!;
      drawKawaiiFace(fh, alphaMask, width, height, {minX, maxX, minY, maxY, cx, cy}, t, tint);

      // まとめて変換して描画
      ctx.save();
      ctx.translate(width/2, height/2 + bobY);
      ctx.rotate(rot);
      ctx.scale(popScale / Math.sqrt(squash), popScale * Math.sqrt(squash));
      ctx.translate(-width/2, -height/2);

      // まずシルエット（不透明度：出現フェーズだけ反映）
      ctx.globalAlpha = popAlpha;
      ctx.drawImage(silMasked, 0, 0);

      // イラスト本体（シルエットからクロスフェード）
      ctx.globalAlpha = Math.max(0.0, Math.min(1.0, settle * 0.95 + 0.05));
      ctx.drawImage(body, 0, 0);

      // 顔/手（後半ほどはっきり）
      ctx.globalAlpha = Math.max(0.0, Math.min(1.0, settle * 0.9 + finish * 0.1));
      ctx.drawImage(faceAndHand, 0, 0);

      // “本人味”：元画像を最後にうっすら
      if (finish > 0) {
        const fgTmp = document.createElement("canvas"); fgTmp.width = width; fgTmp.height = height;
        const fctx = fgTmp.getContext("2d")!;
        drawWithMask(fctx, fg, alphaMask, width, height);
        ctx.globalAlpha = 0.18 * finish;
        ctx.drawImage(fgTmp, 0, 0);
      }

      ctx.restore();
      ctx.globalAlpha = 1;

      // 縁取り（終盤強め）
      drawOutline(ctx, alphaMask, "white", 4, 8, 0.22 + 0.25 * finish);

      // テロップ
      if (finish > 0.2 && label) {
        ctx.save();
        const a = Math.min(1, (finish - 0.2) / 0.4);
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
