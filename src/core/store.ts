import { create } from "zustand";

export type Status = "idle" | "processing" | "error" | "success";
export type Resolution = 720 | 540 | 360;

export interface AppState {
  status: Status;
  resolution: Resolution;
  retryCount: number;
  error: string | null;

  startProcessing: () => void;
  setSuccess: () => void;
  setError: (error: string) => void;
  decrementResolution: () => void;
  incrementRetryCount: () => void;
  handleProcessingError: (error: string) => void;
  logErrorToLocalStorage: (error: string) => void;
  reset: () => void;
}

export const MAX_RETRIES = 3; // Max retries including the initial attempt

export const useStore = create<AppState>((set, get) => ({
  status: "idle",
  resolution: 720,
  retryCount: 0,
  error: null,

  startProcessing: () =>
    set({
      status: "processing",
      error: null,
      retryCount: 0, // Reset retry count on new process start
    }),
  setSuccess: () => set({ status: "success" }),
  setError: (error: string) => set({ status: "error", error }),
  decrementResolution: () => {
    const currentResolution = get().resolution;
    const nextResolution: Resolution = currentResolution === 720 ? 540 : 360;
    if (currentResolution > 360) {
      set({ resolution: nextResolution });
    }
  },
  incrementRetryCount: () =>
    set((state) => ({ retryCount: state.retryCount + 1 })),
  handleProcessingError: (error: string) => {
    const {
      resolution,
      retryCount,
      decrementResolution,
      setError,
      logErrorToLocalStorage,
    } = get();

    if (retryCount < MAX_RETRIES - 1) {
      // Allow MAX_RETRIES attempts (initial + MAX_RETRIES-1 retries)
      if (resolution > 360) {
        decrementResolution();
      }
      set({ status: "processing", error: null }); // Prepare for retry
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
  reset: () =>
    set({ status: "idle", resolution: 720, retryCount: 0, error: null }),
}));
