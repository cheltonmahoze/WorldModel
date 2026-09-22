import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { db } from "@/server/db";
import { AppError, toApiError } from "@/server/errors";
import { getAuth, type AuthContext } from "@/server/auth/session";
import { RATE_LIMITS, clientIp, consume, rateLimitKey } from "@/server/rate-limit";
import type { Permission } from "@/lib/rbac";
import { can, canAny } from "@/lib/rbac";

export type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> };

export type ApiContext<TBody = unknown, TQuery = Record<string, string | undefined>> = {
  request: NextRequest;
  auth: AuthContext;
  db: typeof db;
  params: Record<string, string>;
  body: TBody;
  query: TQuery;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
};

type RateLimitName = keyof typeof RATE_LIMITS;

type RouteOptions<TBody, TQuery> = {
  /** Required permission(s) — any of them grants access. */
  permission?: Permission | Permission[];
  /** Set to false for public endpoints (signup, webhooks). */
  requireAuth?: boolean;
  body?: ZodType<TBody, any, any>;
  query?: ZodType<TQuery, any, any>;
  rateLimit?: RateLimitName | { max: number; windowSeconds: number };
  status?: number;
  handler: (context: ApiContext<TBody, TQuery>) => Promise<unknown>;
};

type NextRouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

function normaliseParams(params: Record<string, string | string[] | undefined> | undefined) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === "string") result[key] = value;
    else if (Array.isArray(value) && value[0]) result[key] = value[0];
  }
  return result;
}

/**
 * Wraps a route handler with the platform's cross-cutting concerns:
 * authentication, RBAC, tenant context, validation, rate limiting,
 * consistent response envelope and error mapping.
 */
export function route<TBody = undefined, TQuery = Record<string, string | undefined>>(
  options: RouteOptions<TBody, TQuery>,
) {
  return async (request: NextRequest, context: NextRouteContext): Promise<NextResponse> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    try {
      const limit =
        typeof options.rateLimit === "string"
          ? RATE_LIMITS[options.rateLimit]
          : (options.rateLimit ?? RATE_LIMITS.read);
      const budget = consume(rateLimitKey(`${request.method}:${new URL(request.url).pathname}`, ip), limit);
      if (!budget.allowed) {
        const error = new AppError("RATE_LIMITED", "rate limit exceeded", {
          userMessage: `Too many requests. Try again in ${budget.retryAfterSeconds}s.`,
        });
        return NextResponse.json(
          { error: { code: error.code, message: error.userMessage, requestId } },
          { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } },
        );
      }

      const requireAuth = options.requireAuth ?? true;
      const auth = await getAuth();
      if (requireAuth && !auth) throw AppError.unauthorized();

      if (options.permission && auth) {
        const permissions = Array.isArray(options.permission) ? options.permission : [options.permission];
        const allowed = permissions.length > 1 ? canAny(auth.role, permissions) : can(auth.role, permissions[0]!);
        if (!allowed) {
          throw AppError.forbidden(
            `Your role (${auth.role.toLowerCase()}) does not allow this action. Ask an administrator for access.`,
          );
        }
      }

      let body = undefined as TBody;
      if (options.body) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw new AppError("BAD_REQUEST", "invalid JSON body", {
            userMessage: "We could not read that request. Please try again.",
          });
        }
        body = options.body.parse(raw);
      }

      let query = {} as TQuery;
      if (options.query) {
        const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
        query = options.query.parse(searchParams);
      }

      const result = await options.handler({
        request,
        auth: auth as AuthContext,
        db,
        params: normaliseParams(await context?.params),
        body,
        query,
        requestId,
        ip,
        userAgent,
      });

      if (result instanceof NextResponse) return result;

      const isEnvelope =
        result !== null && typeof result === "object" && "data" in (result as Record<string, unknown>);
      const payload = isEnvelope ? result : { data: result };
      return NextResponse.json(payload, {
        status: options.status ?? (request.method === "POST" ? 201 : 200),
        headers: { "x-request-id": requestId },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const { status, body } = toApiError(error, requestId);
        return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
      }
      const { status, body } = toApiError(error, requestId);
      return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
    }
  };
}

/** Pagination + sorting helpers shared by every list endpoint. */
export function paginationFrom(query: { page?: number; pageSize?: number; sort?: string; dir?: "asc" | "desc" }) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, orderBy: query.sort ? { [query.sort]: query.dir ?? "desc" } : undefined };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number, extra?: Record<string, unknown>) {
  return {
    data: items,
    meta: {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
      ...extra,
    },
  };
}
