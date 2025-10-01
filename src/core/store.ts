import { create } from "zustand";
import { ProcessingResolution } from './types';

export type Status = "idle" | "processing" | "error" | "success";

export interface AppState {
  status: Status;
  processingResolution: ProcessingResolution;
  retryCount: number;
  error: string | null;
  unsplashApiKey: string | null;

  startProcessing: () => void;
  setSuccess: () => void;
  setError: (error: string) => void;
  decrementResolution: () => void;
  incrementRetryCount: () => void;
  handleProcessingError: (error: string) => void;
  logErrorToLocalStorage: (error: string) => void;
  setUnsplashApiKey: (key: string) => void;
  setProcessingResolution: (resolution: ProcessingResolution) => void;
  reset: () => void;
}

export const MAX_RETRIES = 3;

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  processingResolution: 720,
  retryCount: 0,
  error: null,
  unsplashApiKey: null,

  startProcessing: () =>
    set({
      status: "processing",
      error: null,
      retryCount: 0,
    }),
  setSuccess: () => set({ status: "success" }),
  setError: (error: string) => set({ status: "error", error }),
  decrementResolution: () => {
    const currentResolution = get().processingResolution;
    const nextResolution: ProcessingResolution = currentResolution === 720 ? 540 : 360;
    if (currentResolution > 360) {
      set({ processingResolution: nextResolution });
    }
  },
  incrementRetryCount: () =>
    set((state) => ({ retryCount: state.retryCount + 1 })),
  handleProcessingError: (error: string) => {
    const {
      processingResolution,
      retryCount,
      decrementResolution,
      setError,
      logErrorToLocalStorage,
    } = get();

    if (retryCount < MAX_RETRIES - 1) {
      if (processingResolution > 360) {
        decrementResolution();
      }
      set({ status: "processing", error: null });
    } else {
      setError(error);
      logErrorToLocalStorage(error);
    }
  },
  logErrorToLocalStorage: (error: string) => {
    const timestamp = new Date().toISOString();
    const errorLog = JSON.parse(localStorage.getItem("errorLog") || "[]");
    errorLog.push({ timestamp, error });
    localStorage.setItem("errorLog", JSON.stringify(errorLog));
  },
  setUnsplashApiKey: (key: string) => set({ unsplashApiKey: key }),
  setProcessingResolution: (resolution: ProcessingResolution) => set({ processingResolution: resolution }),
  reset: () =>
    set({
      status: "idle",
      processingResolution: 720,
      retryCount: 0,
      error: null,
      unsplashApiKey: null,
    }),
}));
