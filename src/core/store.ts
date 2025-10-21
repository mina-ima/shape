import { create } from "zustand";
import { runSegmentation } from "../processing";
import { encodeVideo } from "../encode/encoder";
import { imageBitmapToUint8Array, createSolidColorImageBitmap } from "../lib/image"; // 追加
import { generateLayers, generateParallaxFrames } from "../compose/parallax"; // 追加
import cv from "@techstark/opencv-js";
import {
  getMediaStream,
  processImage,
  CameraPermissionDeniedError,
} from "../camera";

export const MAX_RETRIES = 3;

type Status = "idle" | "processing" | "success" | "error";

export type AppState = {
  status: Status;
  error: string | null;
  /** テストの期待に合わせ「現在の試行番号」を格納（1,2,3 ...）。 */
  retryCount: number;
  processingResolution: number;
  unsplashApiKey: string | null;
  generatedVideoBlob: Blob | null;
  generatedVideoMimeType: string | null; // 追加

  setUnsplashApiKey: (key: string | null) => void;
  setProcessingResolution: (res: number) => void;
  reset: () => void;
  startProcessFlow: (inputImage: ImageBitmap) => Promise<void>;

  _setError: (msg: string) => void;
};

/** Vercel/TS の差異に強い Uint8 統一ヘルパ：Clamped/ArrayBufferなどを常に Uint8Array に */
function toUint8ArrayStrict(
  src:
    | Uint8Array
    | Uint8ClampedArray
    | ArrayBuffer
    | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number },
): Uint8Array {
  if (src instanceof Uint8Array) return src;
  if (src instanceof Uint8ClampedArray) {
    return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  }
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  const buf = (src as any).buffer as ArrayBuffer;
  const off = (src as any).byteOffset ?? 0;
  const len = (src as any).byteLength ?? (buf ? buf.byteLength - off : 0);
  return new Uint8Array(buf, off, len);
}

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  error: null,
  retryCount: 0, // idle 時は 0
  processingResolution: 720,
  unsplashApiKey: null,
  generatedVideoBlob: null,
  generatedVideoMimeType: null, // 追加

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
      generatedVideoMimeType: null, // 追加
    }),

  _setError: (msg) => set({ status: "error", error: msg }),

  startProcessFlow: async (inputImage: ImageBitmap) => {
    console.log("startProcessFlow called.");
    const { unsplashApiKey } = get();

    if (!unsplashApiKey) {
      set({
        status: "error",
        error: "Unsplash API Key is missing",
      });
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

    const attempt = async (
      resolution: number,
      attemptNo: number,
    ): Promise<void> => {
      console.log(
        `Attempt ${attemptNo} started with resolution ${resolution}.`,
      );
      try {
        set({ retryCount: attemptNo, processingResolution: resolution });

        // 1. Process image (resize, etc.)
        const processedImage = await processImage(inputImage);

        // 2. Run segmentation
        const { mask, inputSize } = await runSegmentation(processedImage);

        // 3. Convert input images to Uint8Array（型を厳密に統一）
        const originalImageBytes = await imageBitmapToUint8Array(inputImage);
        const originalImageUint8 = toUint8ArrayStrict(originalImageBytes);

        const backgroundImageBitmap = await createSolidColorImageBitmap(
          inputImage.width,
          inputImage.height,
          "#000000",
        );
        const backgroundImageBytes = await imageBitmapToUint8Array(backgroundImageBitmap);
        const backgroundImageUint8 = toUint8ArrayStrict(backgroundImageBytes);

        // 4. Generate layers（mask.data は Uint8ClampedArray のことがあるため明示変換）
        const maskDataUint8 = toUint8ArrayStrict((mask as any).data ?? (mask as any));
        const { foreground, background } = await generateLayers(
          originalImageUint8,
          inputImage.width,
          inputImage.height,
          maskDataUint8,
          (mask as any).width ?? inputImage.width,
          (mask as any).height ?? inputImage.height,
          backgroundImageUint8,
          backgroundImageBitmap.width,
          backgroundImageBitmap.height
        );

        // 5. Generate parallax frames
        const fps = 30;
        const duration = 5; // seconds
        const frames = await generateParallaxFrames(
          foreground,
          background,
          inputImage.width,
          inputImage.height,
          duration,
          fps
        );

        // 6. Encode video（既存APIシグネチャに合わせる）
        const videoBlob = await encodeVideo(frames, fps);
        set({ generatedVideoBlob: videoBlob, generatedVideoMimeType: videoBlob.type });

        set({
          status: "success",
          error: null,
          retryCount: attemptNo,
        });
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

        // カメラ権限エラーの場合はリトライせず、即座にエラー状態にする
        if (err instanceof CameraPermissionDeniedError) {
          set({
            status: "error",
            error: message,
            retryCount: attemptNo, // 試行回数を維持
          });
          console.log(
            "Store: CameraPermissionDeniedError caught. Status:",
            get().status,
            "Error:",
            get().error,
          );
          return;
        }

        if (attemptNo >= MAX_RETRIES) {
          // すべて失敗
          set({
            status: "error",
            error: message,
            retryCount: MAX_RETRIES,
          });
          console.log(
            "Attempt failed (max retries reached). Status:",
            get().status,
          );
          return;
        }

        // 次回のために即時に状態を更新（tests はここで retryCount=2, 解像度=540 などを期待）
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
    // 試行番号は 1 始まり
    await attempt(processingResolution, 1);
  },
}));
