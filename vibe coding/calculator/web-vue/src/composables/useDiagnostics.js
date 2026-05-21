import { ref } from "vue";
import { translateErrorMessage } from "@/utils/error-display.js";

const STORAGE_KEY = "latex_calculator_diagnostics";
const MAX_ENTRIES = 50;

const entries = ref(loadEntries());
const context = ref(createDefaultContext());

let globalHandlersInstalled = false;

function createDefaultContext() {
  return {
    angleUnit: "rad",
    cursorPosition: 0,
    displayMode: "plain",
    evaluationError: null,
    functionName: "",
    functionParams: "",
    parseError: null,
    rawInput: "",
  };
}

function loadEntries() {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistEntries() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value));
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

function trimText(value, limit = 240) {
  const source = String(value ?? "");
  return source.length > limit ? `${source.slice(0, limit)}...` : source;
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      message: translateErrorMessage(error.message),
      name: error.name,
      stack: error.stack || "",
    };
  }

  if (error && typeof error === "object") {
    return {
      message: translateErrorMessage(error.message || "发生了未知错误。"),
      name: error.kind || error.name || typeof error,
      stack: "",
    };
  }

  return {
    message: translateErrorMessage(trimText(String(error ?? "Unknown error"))),
    name: typeof error,
    stack: "",
  };
}

function createEntry({
  category,
  contextOverride = null,
  detail = null,
  level = "info",
  message,
}) {
  return {
    category,
    context: {
      ...context.value,
      ...(contextOverride || {}),
    },
    detail,
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    level,
    message: trimText(message),
    timestamp: new Date().toISOString(),
  };
}

function appendEntry(entry) {
  entries.value = [entry, ...entries.value].slice(0, MAX_ENTRIES);
  persistEntries();
  return entry;
}

function record(options) {
  return appendEntry(createEntry(options));
}

function recordError(category, error, options = {}) {
  const normalizedError = normalizeError(error);

  return record({
    category,
    contextOverride: options.contextOverride || null,
    detail: {
      ...normalizedError,
      ...(options.detail || {}),
    },
    level: "error",
    message: translateErrorMessage(options.message || normalizedError.message || "Unknown error"),
  });
}

function setContext(patch) {
  context.value = {
    ...context.value,
    ...patch,
  };
}

function clearEntries() {
  entries.value = [];
  persistEntries();
}

function exportEntries() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      entries: entries.value,
    },
    null,
    2
  );
}

function downloadEntries() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const blob = new Blob([exportEntries()], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `calculator-diagnostics-${new Date().toISOString().replace(/[:.]/gu, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);

  return true;
}

function installGlobalHandlers() {
  if (globalHandlersInstalled || typeof window === "undefined") {
    return;
  }

  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    recordError("window", event.error || event.message, {
      detail: {
        column: event.colno || null,
        file: event.filename || "",
        line: event.lineno || null,
      },
      message: translateErrorMessage(event.message || "Unhandled window error"),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    recordError("promise", event.reason, {
      message: translateErrorMessage("Unhandled promise rejection"),
    });
  });
}

export function useDiagnostics() {
  return {
    clearEntries,
    context,
    downloadEntries,
    entries,
    exportEntries,
    installGlobalHandlers,
    record,
    recordError,
    setContext,
  };
}
