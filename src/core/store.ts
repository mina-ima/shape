// src/core/store.ts
import { create } from "zustand";
import { runProcessing } from "../processing";

export const MAX_RETRIES = 3;

type Status = "idle" | "processing" | "success" | "error";

type AppState = {
  status: Status;
  error: string | null;
  /** テストの期待に合わせ「現在の試行番号」を格納（1,2,3 ...）。 */
  retryCount: number;
  processingResolution: number;
  unsplashApiKey: string | null;

  setUnsplashApiKey: (key: string | null) => void;
  setProcessingResolution: (res: number) => void;
  reset: () => void;
  startProcessFlow: () => Promise<void>;

  _setError: (msg: string) => void;
};

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  error: null,
  retryCount: 0, // idle 時は 0
  processingResolution: 720,
  unsplashApiKey: null,

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
    }),

  _setError: (msg) => set({ status: "error", error: msg }),

  startProcessFlow: async () => {
    const { unsplashApiKey } = get();

    if (!unsplashApiKey) {
      set({
        status: "error",
        error: "Unsplash API Key is missing",
      });
      return;
    }

    set({ status: "processing", error: null });

    const nextResolution = (current: number) => {
      if (current >= 720) return 540;
      if (current >= 540) return 360;
      return 360;
    };

    const attempt = async (
      resolution: number,
      attemptNo: number,
    ): Promise<void> => {
      try {
        // 現在の試行番号を反映
        set({ retryCount: attemptNo, processingResolution: resolution });
        await runProcessing(resolution);

        // 成功: 試行番号を成功回として残す（tests: 1 を期待）
        set({
          status: "success",
          error: null,
          retryCount: attemptNo, // ← 1 回目成功なら 1
        });
        return;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unknown error";

        if (attemptNo >= MAX_RETRIES) {
          // すべて失敗
          set({
            status: "error",
            error: message,
            retryCount: MAX_RETRIES,
          });
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

        // 1秒後に自動リトライ
        setTimeout(() => {
          attempt(nextRes, attemptNo + 1);
        }, 1000);
      }
    };

    const { processingResolution } = get();
    // 試行番号は 1 始まり
    await attempt(processingResolution, 1);
  },
}));
