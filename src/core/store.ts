// 状態管理（Zustand）: アプリの進行・解像度・APIキーなど
import { create } from "zustand"
import { runProcessing } from "../processing"

export const MAX_RETRIES = 3 // App.tsx から参照される想定の定数

type Status = "idle" | "processing" | "success" | "error"

type AppState = {
  // 状態
  status: Status
  error: string | null
  retryCount: number
  processingResolution: number
  unsplashApiKey: string | null

  // アクション
  setUnsplashApiKey: (key: string | null) => void
  setProcessingResolution: (res: number) => void
  reset: () => void
  startProcessFlow: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  // 初期状態
  status: "idle",
  error: null,
  retryCount: 0,
  processingResolution: 720, // 既定の解像度
  unsplashApiKey: null,

  setUnsplashApiKey: (key) => set({ unsplashApiKey: key }),

  setProcessingResolution: (res) =>
    set({
      processingResolution: Number.isFinite(res) && res > 0 ? Math.floor(res) : 720
    }),

  reset: () =>
    set({
      status: "idle",
      error: null,
      retryCount: 0,
      processingResolution: 720
    }),

  // 実行フロー：解像度(number)を runProcessing に渡す
  startProcessFlow: async () => {
    const { processingResolution, retryCount } = get()

    set({ status: "processing", error: null })

    try {
      await runProcessing(processingResolution)

      set({
        status: "success",
        error: null,
        retryCount: retryCount + 1
      })
    } catch (e) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error"
      set({ status: "error", error: message })
    }
  }
}))
