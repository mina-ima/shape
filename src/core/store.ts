// src/core/store.ts
import { create } from "zustand";
import { runSegmentation } from "../processing";
import { encodeVideoWithMeta } from "../encode/encoder";
import { imageBitmapToUint8Array, createSolidColorImageBitmap } from "../lib/image";
import { generateLayers, generateParallaxFrames } from "../compose/parallax";
import { generateEmergeFrames } from "../compose/emerge";
import { fetchSimilarFromUnsplash } from "../similar/fetchSimilar";
import { processImage, CameraPermissionDeniedError } from "../camera";

// ストリーミング描画・エンコード
import { buildEmergeDrawer } from "../compose/emerge_draw";
import { encodeWithMediaRecorderDraw } from "../encode/mediarec";

// 色ユーティリティ＆Theme型
import { averageColorOfRGB, averageColorOfImage, adjustHsl, mixRGB } from "../lib/color";
import type { Theme } from "../compose/emerge_draw";

export const MAX_RETRIES = 3;

type Status = "idle" | "processing" | "success" | "error";
type ResultMeta = { blob: Blob; filename: string; mime: "video/webm" | "video/mp4" };

export type AppState = {
  status: Status;
  error: string | null;
  retryCount: number;
  processingResolution: number;
  unsplashApiKey: string | null;

  generatedVideoBlob: Blob | null;
  generatedVideoMimeType: string | null;
  result?: ResultMeta;

  setUnsplashApiKey: (key: string | null) => void;
  setProcessingResolution: (res: number) => void;
  reset: () => void;
  startProcessFlow: (inputImage: ImageBitmap) => Promise<void>;

  _setError: (msg: string) => void;
};

/** ========= ユーティリティ ========= */

// 各種配列→Uint8
function normalizeToUint8(
  src:
    | Uint8Array
    | Uint8ClampedArray
    | Float32Array
    | ArrayBuffer
    | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number },
): Uint8Array {
  if (src instanceof Uint8Array) return src;
  if (src instanceof Uint8ClampedArray) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  if (src instanceof Float32Array) {
    const out = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      const scaled = v <= 1 ? v * 255 : v;
      out[i] = Math.max(0, Math.min(255, Math.round(scaled)));
    }
    return out;
  }
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  const buf = (src as any).buffer as ArrayBuffer;
  const off = (src as any).byteOffset ?? 0;
  const len = (src as any).byteLength ?? (buf ? buf.byteLength - off : 0);
  return new Uint8Array(buf, off, len);
}

// RGBA→RGB（A捨て）
function rgbaToRgb(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgb[i] = rgba[j];
    rgb[i + 1] = rgba[j + 1];
    rgb[i + 2] = rgba[j + 2];
  }
  return rgb;
}

// 近傍補間のNN版（フォールバック）
function resizeMaskNearestNeighbor(
  mask: Uint8Array, maskW: number, maskH: number, targetW: number, targetH: number,
): Uint8Array {
  const out = new Uint8Array(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.floor((y * maskH) / targetH);
    for (let x = 0; x < targetW; x++) {
      const sx = Math.floor((x * maskW) / targetW);
      out[y * targetW + x] = mask[sy * maskW + sx];
    }
  }
  return out;
}

// 高品質リサイズ（可能ならCanvas）
async function resizeMaskToImage(
  mask: Uint8Array, maskW: number, maskH: number, targetW: number, targetH: number,
): Promise<Uint8Array> {
  if (maskW === targetW && maskH === targetH) return mask;
  const hasOffscreen = typeof OffscreenCanvas !== "undefined";
  const canUseDOM = typeof document !== "undefined" && !!document.createElement;

  if (hasOffscreen || canUseDOM) {
    try {
      // 1ch→ImageData
      const rgba = new Uint8ClampedArray(maskW * maskH * 4);
      for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
        const v = mask[i];
        rgba[j] = v; rgba[j + 1] = v; rgba[j + 2] = v; rgba[j + 3] = 255;
      }
      const srcImage = new ImageData(rgba, maskW, maskH);

      const srcCanvas: any = hasOffscreen ? new OffscreenCanvas(maskW, maskH) : document.createElement("canvas");
      srcCanvas.width = maskW; srcCanvas.height = maskH;
      const sctx = srcCanvas.getContext("2d") as any;
      sctx.putImageData(srcImage, 0, 0);

      const dstCanvas: any = hasOffscreen ? new OffscreenCanvas(targetW, targetH) : document.createElement("canvas");
      dstCanvas.width = targetW; dstCanvas.height = targetH;
      const dctx = dstCanvas.getContext("2d") as any;

      const hasPut = sctx && typeof sctx.putImageData === "function";
      const hasDraw = dctx && typeof dctx.drawImage === "function";
      const hasGet = dctx && typeof dctx.getImageData === "function";
      if (!hasPut || !hasDraw || !hasGet) return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);

      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = "high";
      dctx.drawImage(srcCanvas, 0, 0, targetW, targetH);

      const dstImage = dctx.getImageData(0, 0, targetW, targetH);
      const out = new Uint8Array(targetW * targetH);
      for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = dstImage.data[j];
      return out;
    } catch {
      return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);
    }
  }
  return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);
}

/** 平均輝度（0..255）。青空など明るい画像なら 160 以上になりやすい。 */
function averageLuma(rgb: Uint8Array, w: number, h: number, step = 12): number {
  let sum = 0, n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 3;
      const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      sum += 0.299 * r + 0.587 * g + 0.114 * b; // Rec.601 近似
      n++;
    }
  }
  return n ? sum / n : 200;
}

/** ポップ寄りのキーワード（実写回避・明るい方向） */
function buildPopKeywords(isBright: boolean): string[] {
  const base = [
    "illustration", "cartoon", "character", "kawaii",
    "pastel", "flat design", "vector", "sticker",
    "bright", "pop", "sky", "blue sky"
  ];
  if (isBright) base.push("white background", "clean", "high key");
  // 実写寄り語は入れない（animalなどは除外）
  return base;
}

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  error: null,
  retryCount: 0,
  processingResolution: 720,
  unsplashApiKey: null,

  generatedVideoBlob: null,
  generatedVideoMimeType: null,
  result: undefined,

  setUnsplashApiKey: (key) => set({ unsplashApiKey: key }),
  setProcessingResolution: (res) =>
    set({ processingResolution: Number.isFinite(res) && res > 0 ? Math.floor(res) : 720 }),
  reset: () =>
    set({
      status: "idle",
      error: null,
      retryCount: 0,
      processingResolution: 720,
      generatedVideoBlob: null,
      generatedVideoMimeType: null,
      result: undefined,
    }),
  _setError: (msg) => set({ status: "error", error: msg }),

  startProcessFlow: async (inputImage: ImageBitmap) => {
    console.log("[Store] startProcessFlow called.");
    const { unsplashApiKey } = get();

    set({ status: "processing", error: null });

    const nextResolution = (current: number) => {
      if (current >= 720) return 540;
      if (current >= 540) return 360;
      return 360;
    };

    const attempt = async (resolution: number, attemptNo: number): Promise<void> => {
      console.log(`[Store] Attempt ${attemptNo} started with resolution ${resolution}.`);
      try {
        set({ retryCount: attemptNo, processingResolution: resolution });

        // 1) 前処理
        const processedImage = await processImage(inputImage);

        // 2) セグメンテーション
        const seg = await runSegmentation(processedImage);
        const rawMaskData = (seg as any)?.mask?.data ?? (seg as any)?.mask ?? (seg as any);
        const maskW = (seg as any)?.mask?.width ?? (seg as any)?.inputSize?.w ?? 320;
        const maskH = (seg as any)?.mask?.height ?? (seg as any)?.inputSize?.h ?? 320;

        // 3) マスク正規化 → 入力サイズへ拡大
        const maskUint8 = normalizeToUint8(rawMaskData);
        const resizedMask = await resizeMaskToImage(maskUint8, maskW, maskH, inputImage.width, inputImage.height);

        // 4) 元画像/背景のRGB化
        const origBytesRGBA = normalizeToUint8(await imageBitmapToUint8Array(inputImage));
        const originalRGB = rgbaToRgb(origBytesRGBA, inputImage.width, inputImage.height);

        // parallax ルートでも暗くならないよう白背景に固定
        const bgBitmap = await createSolidColorImageBitmap(inputImage.width, inputImage.height, "#ffffff");
        const bgBytesRGBA = normalizeToUint8(await imageBitmapToUint8Array(bgBitmap));
        const backgroundRGB = rgbaToRgb(bgBytesRGBA, bgBitmap.width, bgBitmap.height);

        // 5) レイヤ生成
        const { foreground, background } = await generateLayers(
          originalRGB, inputImage.width, inputImage.height,
          resizedMask, inputImage.width, inputImage.height,
          backgroundRGB, bgBitmap.width, bgBitmap.height,
        );

        // 6) 類似画像取得（ポップ寄り）
        let useEmerge = false;
        let similarImage: HTMLImageElement | null = null;
        let theme: Theme | undefined = undefined;

        if (unsplashApiKey) {
          try {
            const luma = averageLuma(originalRGB, inputImage.width, inputImage.height, 12);
            const kws = buildPopKeywords(luma > 160);
            const { image } = await fetchSimilarFromUnsplash(unsplashApiKey, kws, {
              orientation: "portrait",
              // 将来の拡張ヒント（対応しなくても無害）
              style: "illustration",
            } as any);
            similarImage = image;
            useEmerge = true;

            // テーマ生成：明度/彩度を底上げ（ポップ寄り）
            const srcAvg = averageColorOfRGB(originalRGB, inputImage.width, inputImage.height, 12);
            const simAvg = averageColorOfImage(similarImage);
            const bgTop    = adjustHsl(mixRGB(srcAvg, simAvg, 0.3), +0.08, +0.18);
            const bgBottom = adjustHsl(mixRGB(srcAvg, simAvg, 0.6), +0.10, +0.12);
            const accent   = adjustHsl(simAvg, +0.25, +0.20);
            const tint     = mixRGB(simAvg, srcAvg, 0.65); // 被写体寄りをやや強め
            theme = { bg1: bgTop, bg2: bgBottom, accent, subjectTint: tint };
          } catch (e) {
            console.warn("[Store] similar fetch failed, fallback to parallax.", e);
          }
        } else {
          console.log("[Store] Unsplash API key not set; fallback to parallax.");
        }

        // 7) 生成＆8) エンコード
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const fps = isMobile ? 24 : 30;
        const duration = isMobile ? 4 : 5;

        if (useEmerge && similarImage) {
          // ストリーミング描画（フレーム配列を持たない）
          const drawer = buildEmergeDrawer(
            foreground,          // RGB 3ch
            background,          // RGB 3ch
            resizedMask,         // 1ch mask
            similarImage,        // 類似画像
            inputImage.width, inputImage.height,
            duration, fps,
            theme                // 色テーマ
          );

          let blob: Blob | null = null;
          try {
            blob = await encodeWithMediaRecorderDraw(
              { width: drawer.width, height: drawer.height, total: drawer.totalFrames, draw: drawer.draw },
              fps,
              isMobile ? "video/mp4" : "video/webm"
            );
          } catch (e) {
            console.warn("[Encode] MediaRecorder stream failed, fallback to array path:", e);
          }

          if (!blob || blob.size < 10_000) {
            // フォールバック：配列版
            const frames = await generateEmergeFrames(
              foreground, background, resizedMask, similarImage,
              inputImage.width, inputImage.height, duration, fps
            );
            let meta = await encodeVideoWithMeta(frames as any, { fps });
            const MIN_BYTES = 10_000;
            if (!meta?.blob || meta.blob.size < MIN_BYTES) {
              const alt = meta?.mime === "video/mp4" ? "video/webm" : "video/mp4";
              meta = await encodeVideoWithMeta(frames as any, { fps, preferredMime: alt });
            }
            if (!meta?.blob || meta.blob.size < MIN_BYTES) throw new Error("Video encoding failed.");
            set({
              generatedVideoBlob: meta.blob,
              generatedVideoMimeType: meta.mime,
              result: { blob: meta.blob, filename: meta.filename, mime: meta.mime },
            });
          } else {
            const mime = (blob.type || (isMobile ? "video/mp4" : "video/webm")) as "video/mp4" | "video/webm";
            const filename = mime === "video/mp4" ? "output.mp4" : "output.webm";
            set({
              generatedVideoBlob: blob,
              generatedVideoMimeType: mime,
              result: { blob, filename, mime },
            });
          }

          set({ status: "success", error: null, retryCount: attemptNo });
          return;
        } else {
          // parallax ルート
          const frames = await generateParallaxFrames(
            foreground, background,
            inputImage.width, inputImage.height,
            duration, fps,
          );
          let meta = await encodeVideoWithMeta(frames as any, { fps });

          const MIN_BYTES = 10_000;
          if (!meta?.blob || meta.blob.size < MIN_BYTES) {
            const altMime = meta?.mime === "video/mp4" ? "video/webm" : "video/mp4";
            meta = await encodeVideoWithMeta(frames as any, { fps, preferredMime: altMime });
          }
          if (!meta?.blob || meta.blob.size < MIN_BYTES) {
            throw new Error("Video encoding failed: empty or too small blob.");
          }

          set({
            generatedVideoBlob: meta.blob,
            generatedVideoMimeType: meta.mime,
            result: { blob: meta.blob, filename: meta.filename, mime: meta.mime },
          });

          set({ status: "success", error: null, retryCount: attemptNo });
          return;
        }
      } catch (err) {
        const message =
          err instanceof CameraPermissionDeniedError
            ? "権限がありません。写真を選択に切替えます"
            : err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : "Unknown error";

        if (err instanceof CameraPermissionDeniedError) {
          set({ status: "error", error: message, retryCount: attemptNo, result: undefined });
          return;
        }

        if (attemptNo >= MAX_RETRIES) {
          set({ status: "error", error: message, retryCount: MAX_RETRIES, result: undefined });
          return;
        }

        const nextRes = nextResolution(resolution);
        set({
          retryCount: attemptNo + 1,
          processingResolution: nextRes,
          error: null,
          status: "processing",
          result: undefined,
        });

        await new Promise<void>((resolve) => {
          setTimeout(() => { attempt(nextRes, attemptNo + 1).then(resolve); }, 1000);
        });
      }
    };

    const { processingResolution } = get();
    await attempt(processingResolution, 1);
  },
}));
