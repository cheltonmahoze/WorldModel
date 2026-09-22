import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_REACHED"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  PLAN_LIMIT_REACHED: 402,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;
  /** Safe, user-facing message. Internal errors never leak stack traces. */
  userMessage: string;

  constructor(code: ErrorCode, message: string, options: { details?: unknown; userMessage?: string } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.userMessage = options.userMessage ?? message;
  }

  static notFound(entity = "Resource", userMessage?: string) {
    return new AppError("NOT_FOUND", `${entity} not found`, { userMessage });
  }

  static forbidden(userMessage = "You do not have permission to perform this action.") {
    return new AppError("FORBIDDEN", "permission denied", { userMessage });
  }

  static unauthorized(userMessage = "Your session has expired. Please sign in again.") {
    return new AppError("UNAUTHORIZED", "unauthenticated", { userMessage });
  }

  static conflict(message: string, details?: unknown) {
    return new AppError("CONFLICT", message, { details });
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError("BAD_REQUEST", message, { details });
  }

  static planLimit(message: string, details?: unknown) {
    return new AppError("PLAN_LIMIT_REACHED", message, { details, userMessage: message });
  }
}

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

/** Maps any thrown value to a safe API error payload. */
export function toApiError(error: unknown, requestId?: string): { status: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.userMessage, details: error.details, requestId } },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields need your attention.",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
          requestId,
        },
      },
    };
  }
  // Prisma known errors → friendly messages
  const code = (error as { code?: string })?.code;
  if (code === "P2002") {
    const target = (error as { meta?: { target?: string[] } }).meta?.target?.join(", ") ?? "value";
    return {
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: `A record with this ${target} already exists.`,
          requestId,
        },
      },
    };
  }
  if (code === "P2003" || code === "P2014") {
    return {
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: "This record is still referenced elsewhere and cannot be changed.",
          requestId,
        },
      },
    };
  }
  if (code === "P2025") {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "That record no longer exists.", requestId } },
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  // Server-side diagnostics only — never surfaced to the end user.
  console.error(`[api:${requestId ?? "no-request-id"}]`, message, error instanceof Error ? error.stack : "");
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong on our side. The team has been notified.",
        requestId,
      },
    },
  };
}

export function errorResponse(error: unknown, requestId?: string) {
  const { status, body } = toApiError(error, requestId);
  return NextResponse.json(body, { status });
}
