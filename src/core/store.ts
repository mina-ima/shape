// src/core/store.ts
import { create } from "zustand"
import { runProcessing } from "../processing"

export const MAX_RETRIES = 3

type Status = "idle" | "processing" | "success" | "error"

type AppState = {
  status: Status
  error: string | null
  retryCount: number
  processingResolution: number
  unsplashApiKey: string | null

  setUnsplashApiKey: (key: string | null) => void
  setProcessingResolution: (res: number) => void
  reset: () => void
  startProcessFlow: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  error: null,
  retryCount: 0,
  processingResolution: 720,
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

  startProcessFlow: async () => {
    const { processingResolution, retryCount } = get()
    set({ status: "processing", error: null })

    try {
      // ★ 解像度:number を渡す（APIキーは渡さない）
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
