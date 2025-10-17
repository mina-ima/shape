// src/similarity/score.ts
// 方針：perfect=1.0 は「target==candidate かつ 両者に前景あり」のときのみ。
// それ以外は IoU(mask, candidate) を返し、1.0 相当は 0.998 にキャップする。

const EPS = 1e-12 as const;
const NON_PERFECT_CAP = 0.998 as const;

/** RGBA -> RGB二値(前景=1, 背景=0)。R|G|B の合計 > 0 を前景とみなす（Alphaは無視）。 */
function rgbBinary(image: ImageData): Uint8Array {
  const src = image.data;
  const n = src.length;
  const bin = new Uint8Array(n / 4);
  let j = 0;
  for (let i = 0; i < n; i += 4) {
    const r = src[i], g = src[i + 1], b = src[i + 2];
    bin[j++] = (r | g | b) > 0 ? 1 : 0;
  }
  return bin;
}

/** 二値配列の完全一致 */
function equalBinary(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** RGBA配列（生バイト）の完全一致 */
function equalRGBA(a: ImageData, b: ImageData): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const ad = a.data, bd = b.data;
  if (ad.length !== bd.length) return false;
  for (let i = 0; i < ad.length; i++) if (ad[i] !== bd[i]) return false;
  return true;
}

/** 前景が1pxでもあるか（二値） */
function hasForeground(a: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] === 1) return true;
  return false;
}

/** IoU（0..1）。union=0 の場合は一致なら 1、非一致なら 0。 */
function iou(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let inter = 0, union = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i], bv = b[i];
    if (av | bv) union++;
    if (av & bv) inter++;
  }
  if (union === 0) return equalBinary(a, b) ? 1 : 0;
  return inter / union;
}

/**
 * 類似度スコア（0..1）を返す。
 * - foregroundImage: ターゲット画像（RGBA）
 * - backgroundImage: 候補画像（RGBA）
 * - foregroundMask: ターゲットの前景マスク（RGBA, ただしRGBで判定）
 */
export async function calculateSimilarityScore(
  foregroundImage: ImageData,
  backgroundImage: ImageData,
  foregroundMask: ImageData,
): Promise<number> {
  // 事前に二値化
  const binTarget = rgbBinary(foregroundImage);
  const binCandidate = rgbBinary(backgroundImage);
  const binMask = rgbBinary(foregroundMask);

  const fgTarget = hasForeground(binTarget);
  const fgCand = hasForeground(binCandidate);

  // --- 1) perfect：target==candidate かつ 両者に前景あり ---
  const targetEqCand =
    equalRGBA(foregroundImage, backgroundImage) || equalBinary(binTarget, binCandidate);
  if (targetEqCand && fgTarget && fgCand) {
    return 1; // perfect only
  }

  // --- 2) 非 perfect：IoU（mask vs candidate）---
  let score = iou(binMask, binCandidate);

  // --- 3) タイブレーク：非 perfect の 1.0 相当は 0.998 に丸める ---
  //   a) mask と candidate が完全一致（二値）
  //   b) IoU が 1 に非常に近い（丸め誤差含む）
  if (equalBinary(binMask, binCandidate) || score >= 1 - EPS) {
    score = NON_PERFECT_CAP;
  }

  // クランプ
  if (score < 0) score = 0;
  if (score > 1) score = 1;

  return score;
}
