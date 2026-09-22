"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut, type ApiEnvelope } from "@/lib/api-client";

/** Central query-key registry so invalidations never miss a cache entry. */
export const qk = {
  me: ["me"] as const,
  notifications: (filter?: string) => ["notifications", filter ?? "all"] as const,
  notificationCount: ["notifications", "count"] as const,
  search: (query: string) => ["search", query] as const,
  dashboard: ["dashboard"] as const,
  brief: ["brief"] as const,
  insights: (filters?: unknown) => ["insights", filters ?? {}] as const,
  insight: (id: string) => ["insight", id] as const,
  risks: (filters?: unknown) => ["risks", filters ?? {}] as const,
  risk: (id: string) => ["risk", id] as const,
  customers: (filters?: unknown) => ["customers", filters ?? {}] as const,
  customer: (id: string) => ["customer", id] as const,
  contacts: (filters?: unknown) => ["contacts", filters ?? {}] as const,
  opportunities: (filters?: unknown) => ["opportunities", filters ?? {}] as const,
  opportunity: (id: string) => ["opportunity", id] as const,
  activities: (filters?: unknown) => ["activities", filters ?? {}] as const,
  revenue: (window?: string) => ["revenue", window ?? "90d"] as const,
  revenueSeries: (window: string) => ["revenue", "series", window] as const,
  revenueMix: (window: string) => ["revenue", "mix", window] as const,
  analytics: (filters?: unknown) => ["analytics", filters ?? {}] as const,
  automations: (filters?: unknown) => ["automations", filters ?? {}] as const,
  automation: (id: string) => ["automation", id] as const,
  executions: (filters?: unknown) => ["automation-executions", filters ?? {}] as const,
  integrations: ["integrations"] as const,
  integrationDeliveries: (id: string) => ["integration-deliveries", id] as const,
  teams: ["teams"] as const,
  members: (filters?: unknown) => ["members", filters ?? {}] as const,
  invites: ["invites"] as const,
  sessions: ["sessions"] as const,
  audit: (filters?: unknown) => ["audit", filters ?? {}] as const,
  reports: ["reports"] as const,
  operations: (window?: string) => ["operations", window ?? "90d"] as const,
  billing: ["billing"] as const,
  jobs: ["jobs"] as const,
  webhooks: ["webhooks"] as const,
  apiKeys: ["api-keys"] as const,
  team: ["team"] as const,
  ticket: (id: string) => ["ticket", id] as const,
  integration: (id: string) => ["integration", id] as const,
  delivery: (id: string) => ["integration-deliveries", id] as const,
};

/**
 * Reads a paginated collection out of an API envelope. List endpoints answer
 * with `{ data: [...], meta }` while object endpoints nest the collection as
 * `{ data: { items, ... } }` — this normalises both shapes so a page can never
 * silently render an empty list because of envelope drift.
 */
export function pageData<T, M = Record<string, unknown>>(
  envelope: ApiEnvelope<unknown> | undefined,
): { items: T[]; meta: (M & Record<string, unknown>) | undefined } {
  if (!envelope) return { items: [], meta: undefined };
  const raw = envelope.data;
  if (Array.isArray(raw)) {
    return { items: raw as T[], meta: envelope.meta as (M & Record<string, unknown>) | undefined };
  }
  if (raw && typeof raw === "object") {
    const nested = raw as { items?: T[]; meta?: M };
    return {
      items: Array.isArray(nested.items) ? nested.items : [],
      meta: (nested.meta ?? envelope.meta) as (M & Record<string, unknown>) | undefined,
    };
  }
  return { items: [], meta: undefined };
}

type QueryOptions<T> = Omit<UseQueryOptions<ApiEnvelope<T>, ApiError>, "queryKey" | "queryFn">;

/** Thin typed wrapper: every read goes through the platform API envelope. */
export function useApiQuery<T>(key: QueryKey, path: string, options?: QueryOptions<T>) {
  return useQuery<ApiEnvelope<T>, ApiError>({
    queryKey: key,
    queryFn: ({ signal }) => apiGet<T>(path, { signal }),
    ...options,
  });
}

type MutationOptions<TData, TVariables> = {
  path: string | ((variables: TVariables) => string);
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  invalidate?: QueryKey[];
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  errorMessage?: string;
} & Omit<UseMutationOptions<ApiEnvelope<TData>, ApiError, TVariables>, "mutationFn">;

/**
 * Mutations standardise the boring parts: optimistic-free invalidation,
 * success toasts and error surfacing (never a raw stack trace).
 */
export function useApiMutation<TData, TVariables = void>(options: MutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();
  const { path, method = "POST", invalidate = [], successMessage, errorMessage, onSuccess, onError, ...rest } = options;

  return useMutation<ApiEnvelope<TData>, ApiError, TVariables>({
    mutationFn: async (variables) => {
      const resolved = typeof path === "function" ? path(variables) : path;
      if (method === "POST") return apiPost<TData>(resolved, variables);
      if (method === "PATCH") return apiPatch<TData>(resolved, variables);
      if (method === "PUT") return apiPut<TData>(resolved, variables);
      return apiDelete<TData>(resolved);
    },
    onSuccess: (data, variables, context, mutation) => {
      for (const key of invalidate) queryClient.invalidateQueries({ queryKey: key });
      if (successMessage) {
        toast.success(typeof successMessage === "function" ? successMessage(data.data, variables) : successMessage);
      }
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      toast.error(errorMessage ?? error.message);
      onError?.(error, variables, context, mutation);
    },
    ...rest,
  });
}

export { toast };
