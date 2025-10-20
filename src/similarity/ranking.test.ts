// src/similarity/ranking.test.ts
import { describe, it, expect, vi } from "vitest";
import getCV from "@/lib/cv"; // 軽量なテスト用モック
import { calculateSimilarityScore } from "./score";

// opencv-loader をモックし、テスト用cvを返すようにする
vi.mock("@/lib/opencv-loader", () => ({
  default: getCV,
  loadOpenCV: getCV,
}));

/**
 * 純JSでRGBA ImageDataを生成して矩形を白塗りする（OpenCV非依存）。
 */
type Shape = "square" | "rectangle";

function createBlankImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  // 背景は黒・Alpha=255
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; // R
    data[i + 1] = 0; // G
    data[i + 2] = 0; // B
    data[i + 3] = 255; // A
  }
  return new ImageData(data, width, height);
}

function fillRectRGBA(
  img: ImageData,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r = 255,
  g = 255,
  b = 255,
  a = 255,
) {
  const { width, height, data } = img;
  const minX = Math.max(0, Math.min(x1, x2));
  const maxX = Math.min(width - 1, Math.max(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxY = Math.min(height - 1, Math.max(y1, y2));
  for (let y = minY; y <= maxY; y++) {
    const row = y * width * 4;
    for (let x = minX; x <= maxX; x++) {
      const p = row + x * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = a;
    }
  }
}

/**
 * 図形RGBA画像と「前景=白(RGB>0)」マスクを作る。
 * mask は target から渡すため、rectangle側では黒のままにする。
 */
function createShapeImageAndMask(
  shape: Shape,
  width: number,
  height: number,
): { image: ImageData; mask: ImageData } {
  const image = createBlankImageData(width, height);
  const mask = createBlankImageData(width, height);

  if (shape === "square") {
    // 中央付近 50x50 の正方形
    fillRectRGBA(image, 25, 25, 75, 75, 255, 255, 255, 255);
    // マスクも同じ前景領域（target由来の前景マスク）
    fillRectRGBA(mask, 25, 25, 75, 75, 255, 255, 255, 255);
  } else {
    // 類似：横に細長い 80x10 の長方形（square と明確に異なる）
    // square の領域 (y: 25-75) と重ならないように y 座標を調整
    fillRectRGBA(image, 10, 5, 90, 15, 255, 255, 255, 255);
    // マスクは target のものを使うので rectangle 側は黒のまま
  }

  return { image, mask };
}

describe("Similarity Ranking", () => {
  it("should rank shapes correctly based on similarity", async () => {
    const width = 100;
    const height = 100;

    // ターゲット：正方形（image と mask を用意）
    const target = createShapeImageAndMask("square", width, height);

    // 完全一致：正方形（target と一致）
    const perfect = createShapeImageAndMask("square", width, height);

    // 類似：細長い横長長方形（IoUが十分下がる）
    const similar = createShapeImageAndMask("rectangle", width, height);

    const perfectScore = await calculateSimilarityScore(
      target.image, // foregroundImage（ターゲット）
      perfect.image, // backgroundImage（候補：完全一致）
      target.mask, // foregroundMask（ターゲットの前景マスク）
    );
    const similarScore = await calculateSimilarityScore(
      target.image,
      similar.image, // 候補：長方形
      target.mask,
    );

    // 完全一致は ≈1.0、かつ 類似より高い
    expect(perfectScore).toBeGreaterThan(0.99);
    expect(perfectScore).toBeGreaterThan(similarScore);

    // 退行検知：類似は 0.99 未満のはず
    expect(similarScore).toBeLessThan(0.99);
  });
});
