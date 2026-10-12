import { type NavLabel } from "@/app/riskops/config";

// Slugs used by the old ?page= links, kept so existing bookmarks redirect to the new routes.
export const navQueryMap: Record<string, NavLabel> = {
  overview: "Overview",
  analytics: "Risk Analytics",
  "risk-events": "Risk Events",
  "call-logs": "Call Logs",
  applications: "Applications",
  policy: "Policy Center",
  setup: "Application Setup",
  access: "User Access",
};

export const navRoutes: Record<NavLabel, string> = {
  Overview: "/",
  "Risk Analytics": "/analytics",
  "Risk Events": "/risk-events",
  "Call Logs": "/call-logs",
  Applications: "/applications",
  "Policy Center": "/admin/policy",
  "Application Setup": "/admin/setup",
  "User Access": "/admin/access",
};

export function navForPath(pathname: string): NavLabel {
  const match = (Object.entries(navRoutes) as Array<[NavLabel, string]>)
    .find(([, route]) => route !== "/" && (pathname === route || pathname.startsWith(`${route}/`)));

  return match?.[0] ?? "Overview";
}

export function readCurrentSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function replaceUrlParams(nextParams: URLSearchParams) {
  if (typeof window === "undefined") return;

  const query = nextParams.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

export function readInitialRiskEventFilters(search: string) {
  const params = new URLSearchParams(search);

  return {
    q: params.get("q") ?? "",
    level: params.get("level") ?? "All",
    action: params.get("action") ?? "All",
    reviewStatus: params.get("review_status") ?? "All",
    applicationId: params.get("application_id") ?? "",
    environment: params.get("environment") ?? "",
    source: params.get("source") ?? "",
    label: params.get("label") ?? "",
  };
}
