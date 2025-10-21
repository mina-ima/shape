// src/core/store.ts
import { create } from "zustand";
import { runSegmentation } from "../processing";
import { encodeVideo } from "../encode/encoder"; // 追加
import cv from "@techstark/opencv-js"; // 追加
import {
  getMediaStream,
  processImage,
  CameraPermissionDeniedError,
} from "../camera";

export const MAX_RETRIES = 3;

type Status = "idle" | "processing" | "success" | "error";

type AppState = {
  status: Status;
  error: string | null;
  /** テストの期待に合わせ「現在の試行番号」を格納（1,2,3 ...）。 */
  retryCount: number;
  processingResolution: number;
  unsplashApiKey: string | null;
  generatedVideoBlob: Blob | null; // 追加

  setUnsplashApiKey: (key: string | null) => void;
  setProcessingResolution: (res: number) => void;
  reset: () => void;
  startProcessFlow: (inputImage: ImageBitmap) => Promise<void>;

  _setError: (msg: string) => void;
};

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  error: null,
  retryCount: 0, // idle 時は 0
  processingResolution: 720,
  unsplashApiKey: null,
  generatedVideoBlob: null, // 追加

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
      generatedVideoBlob: null, // 追加
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
        await runSegmentation(processedImage);

        // 3. Generate video frames (placeholder for now)
        const dummyFrames: cv.Mat[] = []; // Replace with actual frame generation
        const fps = 30; // Example FPS

        // 4. Encode video
        const videoBlob = await encodeVideo(dummyFrames, fps);
        set({ generatedVideoBlob: videoBlob });

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
