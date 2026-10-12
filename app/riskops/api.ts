import { type UserProfile } from "@/app/riskops/config";
import { profileQueryValue } from "@/app/riskops/mappers";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type ApiRequestOptions = {
  // Only read by the server in demo mode, where it selects the simulated profile.
  profile?: UserProfile;
  query?: URLSearchParams | string | Record<string, string>;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  // Shown when the server gives no reason, for example on a network or parsing failure.
  errorMessage: string;
};

// Every browser call to the API goes through here: one place for the URL, JSON encoding,
// the response envelope, error messages, and the redirect when the session has expired.
export async function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  const params = new URLSearchParams(options.query ?? "");

  if (options.profile) {
    params.set("profile", profileQueryValue(options.profile));
  }

  const query = params.toString();
  const hasBody = options.body !== undefined;
  const response = await fetch(query ? `${path}?${query}` : path, {
    method: options.method ?? "GET",
    cache: "no-store",
    signal: options.signal,
    headers: hasBody ? { "Content-Type": "application/json", ...options.headers } : options.headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; errorCode?: string } | null;

  if (response.status === 401) {
    window.location.assign("/login");
  }

  if (!response.ok || !payload || payload.success === false) {
    throw new ApiRequestError(payload?.error ?? options.errorMessage, response.status, payload?.errorCode ?? null);
  }

  return payload as T;
}
