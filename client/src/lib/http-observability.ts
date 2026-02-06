const COMPONENT_HEADER = "X-Client-Component";
const ACTION_HEADER = "X-Client-Action";
const PROFILE_STORAGE_KEY = "ankidemy:profile-api";

export interface RequestObservabilityMeta {
  component?: string;
  action?: string;
  source?: string;
}

const getNowMs = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

const getMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const getURL = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
};

const extractPath = (url: string): string => {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, origin);
    return parsed.pathname;
  } catch {
    return url;
  }
};

const normalizePathFromStack = (raw: string): string => {
  const noQuery = raw.split("?")[0];
  const srcIndex = noQuery.indexOf("src/");
  if (srcIndex >= 0) return noQuery.slice(srcIndex);
  return noQuery;
};

const inferComponentFromStack = (): string => {
  const stack = new Error().stack;
  if (!stack) return "unknown";

  const lines = stack.split("\n").map(line => line.trim());
  for (const line of lines) {
    if (!line.includes("src/")) continue;
    if (line.includes("http-observability.ts")) continue;
    if (line.includes("lib/api.ts")) continue;
    if (line.includes("lib/srs-api.ts")) continue;

    const fnMatch = line.match(/at\s+([^\s(]+)/);
    const pathMatch = line.match(/src\/[^\s)]+/);
    if (!pathMatch) continue;

    const fileRef = normalizePathFromStack(pathMatch[0]);
    const fn = fnMatch?.[1];
    if (fn && fn !== "async") {
      return `${fileRef}#${fn}`.slice(0, 180);
    }
    return fileRef.slice(0, 180);
  }

  return "unknown";
};

const isProfilingEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  const isDevBuild = process.env.NODE_ENV !== "production";
  if (!isDevBuild) return false;

  // In dev, profiling is on by default. Optional local override:
  // - "0"/"false" disables
  // - "1"/"true" enables
  try {
    const fromStorage = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (fromStorage === "0" || fromStorage === "false") return false;
    if (fromStorage === "1" || fromStorage === "true") return true;
  } catch {
    // Ignore localStorage access failures and keep default dev behavior.
  }
  return true;
};

const logClientRequest = (payload: {
  method: string;
  path: string;
  status?: number;
  durationMs: number;
  component: string;
  action: string;
  requestID?: string | null;
  error?: unknown;
}) => {
  const shouldLog =
    isProfilingEnabled() ||
    payload.error != null ||
    payload.status == null ||
    payload.status >= 400 ||
    payload.durationMs >= 250;
  if (!shouldLog) return;

  const roundedDuration = Number(payload.durationMs.toFixed(2));
  if (payload.error != null) {
    console.warn("[api_observe]", {
      method: payload.method,
      path: payload.path,
      durationMs: roundedDuration,
      component: payload.component,
      action: payload.action,
      requestId: payload.requestID ?? undefined,
      error: payload.error,
    });
    return;
  }

  console.info("[api_observe]", {
    method: payload.method,
    path: payload.path,
    status: payload.status,
    durationMs: roundedDuration,
    component: payload.component,
    action: payload.action,
    requestId: payload.requestID ?? undefined,
  });
};

export const observedFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  meta?: RequestObservabilityMeta,
): Promise<Response> => {
  const method = getMethod(input, init);
  const url = getURL(input);
  const path = extractPath(url);

  const mergedHeaders = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    const initHeaders = new Headers(init.headers);
    initHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }

  const component =
    mergedHeaders.get(COMPONENT_HEADER)?.trim() ||
    meta?.component?.trim() ||
    inferComponentFromStack();
  const action =
    mergedHeaders.get(ACTION_HEADER)?.trim() ||
    meta?.action?.trim() ||
    `${method} ${path}`;

  mergedHeaders.set(COMPONENT_HEADER, component);
  mergedHeaders.set(ACTION_HEADER, action);

  const finalInit: RequestInit = {
    ...init,
    headers: mergedHeaders,
  };

  const startedAt = getNowMs();
  try {
    const response = input instanceof Request
      ? await fetch(new Request(input, finalInit))
      : await fetch(input, finalInit);

    logClientRequest({
      method,
      path,
      status: response.status,
      durationMs: getNowMs() - startedAt,
      component,
      action,
      requestID: response.headers.get("X-Request-ID"),
    });
    return response;
  } catch (error) {
    logClientRequest({
      method,
      path,
      durationMs: getNowMs() - startedAt,
      component,
      action,
      error,
    });
    throw error;
  }
};
