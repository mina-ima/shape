// src/similarity/scoring-logic.ts
import type { Cv } from "@/lib/cv";

/** マスクのαを採用する閾値 */
const ALPHA_ON = 128;

/** （マスク考慮で）完全一致かどうかを先に判定 */
function isExactlyEqual(
  a: ImageData,
  b: ImageData,
  mask?: ImageData,
): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;

  const ad = a.data;
  const bd = b.data;

  let ma: Uint8ClampedArray | null = null;
  let maskUsable = false;

  if (mask && mask.width === a.width && mask.height === a.height) {
    ma = mask.data;
    for (let i = 3; i < ma.length; i += 4) {
      if (ma[i] > 0) {
        maskUsable = true;
        break;
      }
    }
  }

  const N = a.width * a.height;
  let considered = 0;
  for (let i = 0; i < N; i++) {
    if (maskUsable) {
      const alpha = ma![i * 4 + 3] ?? 0;
      if (alpha < ALPHA_ON) continue;
    }
    const o = i * 4;
    // RGBA 完全一致で判定（輝度化前に厳密一致を見る）
    if (
      ad[o] !== bd[o] ||
      ad[o + 1] !== bd[o + 1] ||
      ad[o + 2] !== bd[o + 2] ||
      ad[o + 3] !== bd[o + 3]
    ) {
      return false;
    }
    considered++;
  }

  // マスクで 0px しか見なかった場合は「マスク無しで」厳密一致を再判定
  if (considered === 0 && maskUsable) {
    return isExactlyEqual(a, b, undefined);
  }

  // 1px も比較できない（極端なケース）は「等しい」とみなして 1 に倒す
  return considered === 0 ? true : true;
}

/**
 * 画素コサイン類似度（マスク対応）
 * - マスクは RGBA の α を参照（α>=128 を採用）。
 * - マスクに有効ピクセルが 1つも無い場合は、マスクを無視して再計算。
 * - 分母が 0 になる退化ケースは 0 を返す（厳密一致は isExactlyEqual 側で 1 に吸収）。
 */
function pixelCosineImageData(
  fg: ImageData,
  bg: ImageData,
  mask?: ImageData,
): number {
  if (fg.width !== bg.width || fg.height !== bg.height) return 0;

  const fa = fg.data;
  const ba = bg.data;

  // マスクが「サイズ一致」かつ「α>0 が存在」する場合のみ有効化
  let maskUsable = false;
  let ma: Uint8ClampedArray | null = null;
  if (mask && mask.width === fg.width && mask.height === fg.height) {
    ma = mask.data;
    for (let i = 3; i < ma.length; i += 4) {
      if (ma[i] > 0) {
        maskUsable = true;
        break;
      }
    }
  }

  let dot = 0;
  let na = 0;
  let nb = 0;
  let used = 0;

  const N = fg.width * fg.height;
  for (let i = 0; i < N; i++) {
    if (maskUsable) {
      const a = ma![i * 4 + 3] ?? 0; // マスクのα
      if (a < ALPHA_ON) continue; // ほぼ透明は無視
    }

    // RGB → 輝度（グレイスケール）へ
    const r1 = fa[i * 4] ?? 0,
      g1 = fa[i * 4 + 1] ?? 0,
      b1 = fa[i * 4 + 2] ?? 0;
    const r2 = ba[i * 4] ?? 0,
      g2 = ba[i * 4 + 1] ?? 0,
      b2 = ba[i * 4 + 2] ?? 0;

    const y1 = (0.299 * r1 + 0.587 * g1 + 0.114 * b1) / 255;
    const y2 = (0.299 * r2 + 0.587 * g2 + 0.114 * b2) / 255;

    dot += y1 * y2;
    na += y1 * y1;
    nb += y2 * y2;
    used++;
  }

  // マスク適用により 1px も比較できなかった → マスク無しで再計算
  if (used === 0 && maskUsable) {
    return pixelCosineImageData(fg, bg, undefined);
  }

  if (used === 0 || na === 0 || nb === 0) return 0;

  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  if (!Number.isFinite(sim)) return 0;
  return Math.max(0, Math.min(1, sim));
}

/**
 * 画像類似度のメイン関数
 * - まず厳密一致チェック（マスク考慮）で早期に 1 を返す
 * - それ以外はコサイン類似度
 * - 依存注入の `cvInstance` は将来拡張用（現状未使用）
 */
export async function performSimilarityCalculation(
  _cvInstance: Cv,
  foregroundImage: ImageData,
  backgroundImage: ImageData,
  foregroundMask: ImageData,
): Promise<number> {
  // 1) 厳密一致なら 1
  if (isExactlyEqual(foregroundImage, backgroundImage, foregroundMask)) {
    return 1;
  }
  // 2) コサイン類似度
  return pixelCosineImageData(
    foregroundImage,
    backgroundImage,
    foregroundMask,
  );
}

// テストで直接使いたい時用にエクスポート
export { pixelCosineImageData, isExactlyEqual };
