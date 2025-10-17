// src/similarity/ranking.ts
import loadOpenCV from "@/lib/opencv-loader";
import { performSimilarityCalculation } from "./scoring-logic";

/**
 * foreground と各 background の類似度を計算し、高い順に並べる。
 * 返り値: index と score の配列（score の降順）
 */
export async function rankBackgrounds(
  foregroundImage: ImageData,
  backgroundImages: ImageData[],
  foregroundMask: ImageData,
): Promise<Array<{ index: number; score: number }>> {
  // モジュール（名前空間オブジェクト）を await しないよう、常に getCV() を await して実体を取得
  const cv = await loadOpenCV();

  const scores: number[] = [];
  for (let i = 0; i < backgroundImages.length; i++) {
    const score = await performSimilarityCalculation(
      cv,
      foregroundImage,
      backgroundImages[i],
      foregroundMask,
    );
    scores.push(score);
  }

  return scores
    .map((score, index) => ({ index, score }))
    .sort((a, b) => b.score - a.score);
}

// 互換のため default でも export（テスト側が default import でも動くように）
export default rankBackgrounds;
