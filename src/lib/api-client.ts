export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore?: boolean;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: Record<string, string[]>;

  constructor(options: { message: string; code: string; status: number; requestId?: string; details?: Record<string, string[]> }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.details = options.details;
  }

  get isAuth() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  /** Field-level message from a server Zod error, if present. */
  fieldError(field: string) {
    return this.details?.[field]?.[0];
  }
}

type ErrorBody = {
  error?: { code?: string; message?: string; details?: Record<string, string[]>; requestId?: string };
};

/**
 * Single client-side entry point for the JSON API. It never throws raw fetch
 * errors and always surfaces a user-safe message from the server envelope.
 */
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<ApiEnvelope<T>> {
  const { json, headers, ...rest } = init;
  let response: Response;

  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError({
      code: "NETWORK",
      status: 0,
      message: "We could not reach the server. Check your connection and try again.",
    });
  }

  if (response.status === 204) return { data: undefined as T };

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ErrorBody;
    throw new ApiError({
      code: body.error?.code ?? `HTTP_${response.status}`,
      status: response.status,
      message: body.error?.message ?? "Something went wrong. Please try again.",
      requestId: body.error?.requestId,
      details: body.error?.details,
    });
  }

  if (payload && typeof payload === "object" && "data" in payload) return payload as ApiEnvelope<T>;
  return { data: payload as T };
}

export async function apiGet<T>(path: string, init?: RequestInit) {
  return apiFetch<T>(path, { ...init, method: "GET" });
}

export async function apiPost<T>(path: string, json?: unknown, init?: RequestInit) {
  return apiFetch<T>(path, { ...init, method: "POST", json });
}

export async function apiPatch<T>(path: string, json?: unknown, init?: RequestInit) {
  return apiFetch<T>(path, { ...init, method: "PATCH", json });
}

export async function apiPut<T>(path: string, json?: unknown, init?: RequestInit) {
  return apiFetch<T>(path, { ...init, method: "PUT", json });
}

export async function apiDelete<T>(path: string, init?: RequestInit) {
  return apiFetch<T>(path, { ...init, method: "DELETE" });
}

/** Builds a query string, dropping empty values. */
export function queryString(params: Record<string, string | number | boolean | undefined | null | (string | number)[]>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      search.set(key, value.join(","));
    } else {
      search.set(key, String(value));
    }
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

/** Triggers a browser download from a generated blob (CSV exports). */
export function downloadBlob(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
