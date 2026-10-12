import { NextResponse } from "next/server";

type ApiPayload = Record<string, unknown>;

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

function requestId() {
  return `req-${crypto.randomUUID().slice(0, 8)}`;
}

export function apiOk(payload: ApiPayload = {}, status = 200) {
  return NextResponse.json(
    {
      success: true,
      ...payload,
      meta: {
        requestId: requestId(),
      },
    },
    { status },
  );
}

export function apiCreated(payload: ApiPayload = {}) {
  return NextResponse.json(
    {
      success: true,
      ...payload,
      meta: {
        requestId: requestId(),
      },
    },
    { status: 201 },
  );
}

export function apiError(
  status: number,
  errorCode: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      errorCode,
      details,
      meta: {
        requestId: requestId(),
      },
    },
    { status, headers },
  );
}
