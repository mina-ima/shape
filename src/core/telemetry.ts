interface TelemetryEvent {
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
}

const TELEMETRY_ENABLED_KEY = "telemetryEnabled";
const TELEMETRY_LOG_KEY = "telemetryLog";

function isTelemetryEnabled(): boolean {
  return localStorage.getItem(TELEMETRY_ENABLED_KEY) === "true";
}

export function enableTelemetry(): void {
  localStorage.setItem(TELEMETRY_ENABLED_KEY, "true");
}

export function disableTelemetry(): void {
  localStorage.setItem(TELEMETRY_ENABLED_KEY, "false");
}

export function logTelemetryEvent(
  event: string,
  data: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const log = getTelemetryLog();
  const newEvent: TelemetryEvent = {
    timestamp: new Date().toISOString(),
    event,
    data,
  };
  log.push(newEvent);
  localStorage.setItem(TELEMETRY_LOG_KEY, JSON.stringify(log));
}

export function getTelemetryLog(): TelemetryEvent[] {
  const logString = localStorage.getItem(TELEMETRY_LOG_KEY);
  if (logString) {
    try {
      return JSON.parse(logString) as TelemetryEvent[];
    } catch (e) {
      console.error("Error parsing telemetry log from localStorage", e);
      return [];
    }
  }
  return [];
}

export function clearTelemetryLog(): void {
  localStorage.setItem(TELEMETRY_LOG_KEY, "[]");
}
