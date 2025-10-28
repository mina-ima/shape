// src/core/store.ts
import { create } from "zustand";
import { runSegmentation } from "../processing";
import { encodeVideoWithMeta } from "../encode/encoder";
import { imageBitmapToUint8Array, createSolidColorImageBitmap } from "../lib/image";
import { generateLayers, generateParallaxFrames } from "../compose/parallax";
import { generateEmergeFrames } from "../compose/emerge";
import { fetchSimilarFromUnsplash } from "../similar/fetchSimilar";
import {
  processImage,
  CameraPermissionDeniedError,
} from "../camera";

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

/** 型ユーティリティ */
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
function rgbaToRgb(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgb[i] = rgba[j];
    rgb[i + 1] = rgba[j+1];
    rgb[i + 2] = rgba[j+2];
  }
  return rgb;
}
function mask1chToImageData(mask: Uint8Array, width: number, height: number): ImageData {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    const v = mask[i];
    rgba[j] = v; rgba[j + 1] = v; rgba[j + 2] = v; rgba[j + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}
function imageDataToMask1ch(img: ImageData): Uint8Array {
  const { data, width, height } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = data[j];
  return out;
}
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
async function resizeMaskToImage(
  mask: Uint8Array, maskW: number, maskH: number, targetW: number, targetH: number,
): Promise<Uint8Array> {
  if (maskW === targetW && maskH === targetH) return mask;
  const hasOffscreen = typeof OffscreenCanvas !== "undefined";
  const canUseDOM = typeof document !== "undefined" && !!document.createElement;

  if (hasOffscreen || canUseDOM) {
    try {
      const srcImage = mask1chToImageData(mask, maskW, maskH);
      const srcCanvas: any = hasOffscreen ? new OffscreenCanvas(maskW, maskH) : document.createElement("canvas");
      srcCanvas.width = maskW; srcCanvas.height = maskH;
      const sctx = srcCanvas.getContext("2d") as any;

      const dstCanvas: any = hasOffscreen ? new OffscreenCanvas(targetW, targetH) : document.createElement("canvas");
      dstCanvas.width = targetW; dstCanvas.height = targetH;
      const dctx = dstCanvas.getContext("2d") as any;

      const hasPut = sctx && typeof sctx.putImageData === "function";
      const hasDraw = dctx && typeof dctx.drawImage === "function";
      const hasGet = dctx && typeof dctx.getImageData === "function";
      if (!hasPut || !hasDraw || !hasGet) return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);

      sctx.putImageData(srcImage, 0, 0);
      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = "high";
      dctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
      const dstImage = dctx.getImageData(0, 0, targetW, targetH);
      return imageDataToMask1ch(dstImage);
    } catch {
      return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);
    }
  }
  return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);
}

/** 撮影画像から類推する検索キーワード（超簡易） */
function guessKeywordsForUnsplash(maskW: number, maskH: number, imageW: number, imageH: number): string[] {
  const ar = imageH > 0 ? imageW / imageH : 1;
  const maskAR = maskH > 0 ? maskW / maskH : 1;
  const base = ["portrait", "subject", "clean background"];
  const isPortrait = ar < 1.0;
  const kws: string[] = [];

  // 形状のヒント（かなりラフ）
  if (maskAR < 0.8) kws.push("tall");
  else if (maskAR > 1.2) kws.push("wide");

  // 動物 or キャラ（ユーザー要望を優先）
  kws.push("animal OR character");

  // 構図
  if (isPortrait) kws.push("portrait");
  else kws.push("center composition");

  return [...new Set([...kws, ...base])];
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
    console.log("[Store] Status set to processing.");

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
        console.log("[Store] preprocess...");
        const processedImage = await processImage(inputImage);

        // 2) セグメンテーション
        console.log("[Store] segmentation...");
        const seg = await runSegmentation(processedImage);
        console.log("[Store] segmentation done");

        const rawMaskData = (seg as any)?.mask?.data ?? (seg as any)?.mask ?? (seg as any);
        const maskW = (seg as any)?.mask?.width ?? (seg as any)?.inputSize?.w ?? 320;
        const maskH = (seg as any)?.mask?.height ?? (seg as any)?.inputSize?.h ?? 320;

        // 3) マスク正規化 → 入力サイズへ拡大
        console.log("[Store] resize mask...");
        const maskUint8 = normalizeToUint8(rawMaskData);
        const resizedMask = await resizeMaskToImage(maskUint8, maskW, maskH, inputImage.width, inputImage.height);

        // 4) 元画像/背景のRGB化
        console.log("[Store] prepare RGB layers...");
        const origBytesRGBA = normalizeToUint8(await imageBitmapToUint8Array(inputImage));
        const originalRGB = rgbaToRgb(origBytesRGBA, inputImage.width, inputImage.height);

        const bgBitmap = await createSolidColorImageBitmap(inputImage.width, inputImage.height, "#000000");
        const bgBytesRGBA = normalizeToUint8(await imageBitmapToUint8Array(bgBitmap));
        const backgroundRGB = rgbaToRgb(bgBytesRGBA, bgBitmap.width, bgBitmap.height);

        // 5) レイヤ生成（従来の前景/背景）
        console.log("[Store] generate layers...");
        const { foreground, background } = await generateLayers(
          originalRGB, inputImage.width, inputImage.height,
          resizedMask, inputImage.width, inputImage.height,
          backgroundRGB, bgBitmap.width, bgBitmap.height,
        );

        // 6) 類似画像取得（あれば emerge ルート、ダメなら parallax）
        let useEmerge = false;
        let similarImage: HTMLImageElement | null = null;

        if (unsplashApiKey) {
          try {
            console.log("[Store] fetch similar from Unsplash...");
            const kws = guessKeywordsForUnsplash(maskW, maskH, inputImage.width, inputImage.height);
            const { image } = await fetchSimilarFromUnsplash(unsplashApiKey, kws, { orientation: "portrait" });
            similarImage = image;
            useEmerge = true;
            console.log("[Store] similar image fetched.");
          } catch (e) {
            console.warn("[Store] similar fetch failed, fallback to parallax.", e);
          }
        } else {
          console.log("[Store] Unsplash API key not set; fallback to parallax.");
        }

        // 7) フレーム生成
        console.log("[Store] generate frames...");
        const fps = 30;
        const duration = 5; // 秒
        let frames: (HTMLCanvasElement)[];

        if (useEmerge && similarImage) {
          frames = await generateEmergeFrames(
            foreground, // RGB3ch
            background, // RGB3ch
            resizedMask,
            similarImage,
            inputImage.width, inputImage.height,
            duration, fps,
          );
        } else {
          frames = await generateParallaxFrames(
            foreground, background,
            inputImage.width, inputImage.height,
            duration, fps,
          );
        }
        console.log("[Store] frames ready:", frames.length);

        // 8) エンコード
        console.log("[Store] encode...");
        let meta = await encodeVideoWithMeta(frames as any, { fps });
        console.log("[Result] first encode:", { mime: meta?.mime, size: meta?.blob?.size, filename: meta?.filename });

        const MIN_BYTES = 10_000;
        const isBlobInvalid = !meta?.blob || meta.blob.size < MIN_BYTES;
        if (isBlobInvalid) {
          console.warn("[Encode] Blob too small or empty. Retrying with alternate mime...");
          const altMime = meta?.mime === "video/mp4" ? "video/webm" : "video/mp4";
          meta = await encodeVideoWithMeta(frames as any, { fps, preferredMime: altMime });
          console.log("[Result] alt encode:", { mime: meta?.mime, size: meta?.blob?.size, filename: meta?.filename });
        }
        if (!meta?.blob || meta.blob.size < MIN_BYTES) {
          throw new Error("Video encoding failed: empty or too small blob.");
        }

        // 9) state 更新→success
        set({
          generatedVideoBlob: meta.blob,
          generatedVideoMimeType: meta.mime,
          result: { blob: meta.blob, filename: meta.filename, mime: meta.mime },
        });
        console.log("[Store] encode done: size=", meta.blob.size, "mime=", meta.mime);

        set({ status: "success", error: null, retryCount: attemptNo });
        console.log("[Store] attempt successful.");
        return;
      } catch (err) {
        const message =
          err instanceof CameraPermissionDeniedError
            ? "権限がありません。写真を選択に切替えます"
            : err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : "Unknown error";
        console.warn("[Store] attempt error:", message);

        if (err instanceof CameraPermissionDeniedError) {
          set({ status: "error", error: message, retryCount: attemptNo, result: undefined });
          return;
        }

        if (attemptNo >= MAX_RETRIES) {
          set({ status: "error", error: message, retryCount: MAX_RETRIES, result: undefined });
          console.log("[Store] attempt failed (max retries reached). Status:", get().status);
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
        console.log("[Store] attempt failed (retrying). Status:", get().status);

        await new Promise<void>((resolve) => {
          setTimeout(() => { attempt(nextRes, attemptNo + 1).then(resolve); }, 1000);
        });
      }
    };

    const { processingResolution } = get();
    await attempt(processingResolution, 1);
  },
}));
