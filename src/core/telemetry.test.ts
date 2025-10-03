import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enableTelemetry,
  disableTelemetry,
  logTelemetryEvent,
  getTelemetryLog,
  clearTelemetryLog,
  TELEMETRY_ENABLED_KEY,
  TELEMETRY_LOG_KEY,
} from "./telemetry";

describe("Telemetry Module", () => {
  const MOCK_DATE = new Date("2025-10-27T10:00:00Z");
  let localStorageData: Record<string, string> = {};
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);

    localStorageData = {}; // Reset data for each test
    localStorageMock = {
      getItem: vi.fn((key: string) => localStorageData[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageData[key] = value;
      }),
      clear: vi.fn(() => {
        localStorageData = {};
      }),
    };

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorageMock.clear();
  });

  it("should be disabled by default and not save anything", () => {
    logTelemetryEvent("testEvent", { duration: 100 });
    expect(localStorageMock.getItem).toHaveBeenCalledWith("telemetryEnabled");
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
      "telemetryLog",
      expect.any(String),
    );
  });

  it("should enable telemetry and save events to localStorage", () => {
    enableTelemetry();
    logTelemetryEvent("segmentation", { duration: 250, model: "u2net" });

    const expectedLog = [
      {
        timestamp: MOCK_DATE.toISOString(),
        event: "segmentation",
        data: { duration: 250, model: "u2net" },
      },
    ];

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "telemetryEnabled",
      "true",
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "telemetryLog",
      JSON.stringify(expectedLog),
    );
    expect(getTelemetryLog()).toEqual(expectedLog);
  });

  it("should append new events to existing log", () => {
    enableTelemetry();
    logTelemetryEvent("event1", { value: 1 });
    logTelemetryEvent("event2", { value: 2 });

    const expectedLog = [
      {
        timestamp: MOCK_DATE.toISOString(),
        event: "event1",
        data: { value: 1 },
      },
      {
        timestamp: MOCK_DATE.toISOString(),
        event: "event2",
        data: { value: 2 },
      },
    ];

    expect(getTelemetryLog()).toEqual(expectedLog);
  });

  it("should disable telemetry and stop saving events", () => {
    enableTelemetry();
    logTelemetryEvent("event1", { value: 1 });
    disableTelemetry();
    logTelemetryEvent("event2", { value: 2 });

    const expectedLog = [
      {
        timestamp: MOCK_DATE.toISOString(),
        event: "event1",
        data: { value: 1 },
      },
    ];

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "telemetryEnabled",
      "false",
    );
    expect(getTelemetryLog()).toEqual(expectedLog);
  });

  it("should clear the telemetry log", () => {
    enableTelemetry();
    logTelemetryEvent("event1", { value: 1 });
    clearTelemetryLog();

    expect(localStorageMock.setItem).toHaveBeenCalledWith("telemetryLog", "[]");
    expect(getTelemetryLog()).toEqual([]);
  });

  it("should handle invalid JSON in localStorage gracefully", () => {
    localStorage.setItem("telemetryEnabled", "true");
    localStorage.setItem("telemetryLog", "invalid json");

    logTelemetryEvent("event", {});
    const log = getTelemetryLog();
    expect(log.length).toBe(1);
    expect(log[0].event).toBe("event");
  });
});
