import { create } from "zustand";
import { runSegmentation } from "../processing";
import { encodeVideo } from "../encode/encoder";
import { imageBitmapToUint8Array, createSolidColorImageBitmap } from "../lib/image";
import { generateLayers, generateParallaxFrames } from "../compose/parallax";
import {
  processImage,
  CameraPermissionDeniedError,
} from "../camera";

export const MAX_RETRIES = 3;

type Status = "idle" | "processing" | "success" | "error";

export type AppState = {
  status: Status;
  error: string | null;
  /** 現在の試行番号（1始まり） */
  retryCount: number;
  processingResolution: number;
  unsplashApiKey: string | null;
  generatedVideoBlob: Blob | null;
  generatedVideoMimeType: string | null;

  setUnsplashApiKey: (key: string | null) => void;
  setProcessingResolution: (res: number) => void;
  reset: () => void;
  startProcessFlow: (inputImage: ImageBitmap) => Promise<void>;

  _setError: (msg: string) => void;
};

/** TypedArray を Uint8Array に正規化（Clamped/Float32/ArrayBufferに対応） */
function normalizeToUint8(
  src:
    | Uint8Array
    | Uint8ClampedArray
    | Float32Array
    | ArrayBuffer
    | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number },
): Uint8Array {
  if (src instanceof Uint8Array) return src;
  if (src instanceof Uint8ClampedArray) {
    return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  }
  if (src instanceof Float32Array) {
    // 0..1 or 0..255 を想定。>1 も 0..255 にクリップ
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

/** RGBA(4ch) → RGB(3ch) 変換 */
function rgbaToRgb(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgb[i] = rgba[j];       // R
    rgb[i + 1] = rgba[j+1]; // G
    rgb[i + 2] = rgba[j+2]; // B
  }
  return rgb;
}

/** 1chマスク(0..255) → ImageData(RGBA) */
function mask1chToImageData(mask: Uint8Array, width: number, height: number): ImageData {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    const v = mask[i];
    rgba[j] = v; rgba[j + 1] = v; rgba[j + 2] = v; rgba[j + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}

/** ImageData(RGBA) → 1chマスク(R成分) */
function imageDataToMask1ch(img: ImageData): Uint8Array {
  const { data, width, height } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = data[j];
  }
  return out;
}

/** 最近傍フォールバック（Canvas が使えない/未実装 API の環境用） */
function resizeMaskNearestNeighbor(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  targetW: number,
  targetH: number,
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

/** Canvas/OffscreenCanvas でマスクをターゲット解像度へ拡大（不可なら NN フォールバック） */
async function resizeMaskToImage(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  targetW: number,
  targetH: number,
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

      // jsdom/一部実装では putImageData / drawImage / getImageData が未実装なことがある
      const hasPut = sctx && typeof sctx.putImageData === "function";
      const hasDraw = dctx && typeof dctx.drawImage === "function";
      const hasGet = dctx && typeof dctx.getImageData === "function";
      if (!hasPut || !hasDraw || !hasGet) {
        return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);
      }

      sctx.putImageData(srcImage, 0, 0);
      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = "high";
      dctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
      const dstImage = dctx.getImageData(0, 0, targetW, targetH);
      return imageDataToMask1ch(dstImage);
    } catch {
      // 例外時もフォールバック
      return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);
    }
  }

  // 非ブラウザ環境のフォールバック（最近傍）
  return resizeMaskNearestNeighbor(mask, maskW, maskH, targetW, targetH);
}

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  error: null,
  retryCount: 0,
  processingResolution: 720,
  unsplashApiKey: null,
  generatedVideoBlob: null,
  generatedVideoMimeType: null,

  setUnsplashApiKey: (key) => set({ unsplashApiKey: key }),

  setProcessingResolution: (res) =>
    set({
      processingResolution:
        Number.isFinite(res) && res > 0 ? Math.floor(res) : 720,
    }),

  reset: () =>
    set({
      status: "idle",
      error: null,
      retryCount: 0,
      processingResolution: 720,
      generatedVideoBlob: null,
      generatedVideoMimeType: null,
    }),

  _setError: (msg) => set({ status: "error", error: msg }),

  startProcessFlow: async (inputImage: ImageBitmap) => {
    console.log("startProcessFlow called.");
    const { unsplashApiKey } = get();

    if (!unsplashApiKey) {
      set({ status: "error", error: "Unsplash API Key is missing" });
      console.log("startProcessFlow: API Key missing.");
      return;
    }

    set({ status: "processing", error: null });
    console.log("startProcessFlow: Status set to processing.");

    const nextResolution = (current: number) => {
      if (current >= 720) return 540;
      if (current >= 540) return 360;
      return 360;
    };

    const attempt = async (resolution: number, attemptNo: number): Promise<void> => {
      console.log(`Attempt ${attemptNo} started with resolution ${resolution}.`);
      try {
        set({ retryCount: attemptNo, processingResolution: resolution });

        // 1) 前処理
        const processedImage = await processImage(inputImage);

        // 2) セグメンテーション
        const seg = await runSegmentation(processedImage);

        // 出力から data/width/height を頑健に解決
        const rawMaskData =
          (seg as any)?.mask?.data ??
          (seg as any)?.mask ??
          (seg as any);
        const maskW =
          (seg as any)?.mask?.width ??
          (seg as any)?.inputSize?.w ??
          320;
        const maskH =
          (seg as any)?.mask?.height ??
          (seg as any)?.inputSize?.h ??
          320;

        // 3) マスクを Uint8 に正規化 → 元画像サイズへ拡大
        const maskUint8 = normalizeToUint8(rawMaskData);
        const resizedMask = await resizeMaskToImage(
          maskUint8,
          maskW,
          maskH,
          inputImage.width,
          inputImage.height,
        );

        // 4) 元画像/背景のバイト列を取得し、RGB(3ch)へ
        const origBytesRGBA = normalizeToUint8(await imageBitmapToUint8Array(inputImage));
        const originalRGB = rgbaToRgb(origBytesRGBA, inputImage.width, inputImage.height);

        const bgBitmap = await createSolidColorImageBitmap(
          inputImage.width,
          inputImage.height,
          "#000000",
        );
        const bgBytesRGBA = normalizeToUint8(await imageBitmapToUint8Array(bgBitmap));
        const backgroundRGB = rgbaToRgb(bgBytesRGBA, bgBitmap.width, bgBitmap.height);

        // 5) レイヤ生成（元画像サイズの1chマスク＋RGB3ch画像を渡す）
        const { foreground, background } = await generateLayers(
          originalRGB,
          inputImage.width,
          inputImage.height,
          resizedMask,
          inputImage.width,
          inputImage.height,
          backgroundRGB,
          bgBitmap.width,
          bgBitmap.height,
        );

        // 6) パララックス → 動画エンコード
        const fps = 30;
        const duration = 5;
        const frames = await generateParallaxFrames(
          foreground,
          background,
          inputImage.width,
          inputImage.height,
          duration,
          fps,
        );

        const videoBlob = await encodeVideo(frames, fps);
        set({ generatedVideoBlob: videoBlob, generatedVideoMimeType: videoBlob.type });

        set({ status: "success", error: null, retryCount: attemptNo });
        console.log("Attempt successful.");
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
        console.log("Error caught in attempt:", message);

        if (err instanceof CameraPermissionDeniedError) {
          set({ status: "error", error: message, retryCount: attemptNo });
          return;
        }

        if (attemptNo >= MAX_RETRIES) {
          set({ status: "error", error: message, retryCount: MAX_RETRIES });
          console.log("Attempt failed (max retries reached). Status:", get().status);
          return;
        }

        const nextRes = nextResolution(resolution);
        set({
          retryCount: attemptNo + 1,
          processingResolution: nextRes,
          error: null,
          status: "processing",
        });
        console.log("Attempt failed (retrying). Status:", get().status);

        await new Promise<void>((resolve) => {
          setTimeout(() => {
            attempt(nextRes, attemptNo + 1).then(resolve);
          }, 1000);
        });
      }
    };

    const { processingResolution } = get();
    await attempt(processingResolution, 1);
  },
}));
