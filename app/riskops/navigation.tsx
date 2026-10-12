import { type NavLabel } from "@/app/riskops/config";

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

export const navSlugMap: Record<NavLabel, string> = {
  Overview: "overview",
  "Risk Analytics": "analytics",
  "Risk Events": "risk-events",
  "Call Logs": "call-logs",
  Applications: "applications",
  "Policy Center": "policy",
  "Application Setup": "setup",
  "User Access": "access",
};

// During server rendering there is no window, so callers that render from the URL pass the request's
// query string to keep the server markup identical to the first client render.
export function readCurrentSearchParams(serverSearch = "") {
  if (typeof window === "undefined") return new URLSearchParams(serverSearch);
  return new URLSearchParams(window.location.search);
}

export function readInitialNav(serverSearch = ""): NavLabel {
  const page = readCurrentSearchParams(serverSearch).get("page");
  return page ? navQueryMap[page] ?? "Overview" : "Overview";
}

export function replaceUrlParams(nextParams: URLSearchParams) {
  if (typeof window === "undefined") return;

  const query = nextParams.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

export function updateUrlPage(page: NavLabel) {
  const params = readCurrentSearchParams();
  params.set("page", navSlugMap[page]);
  replaceUrlParams(params);
}

export function readInitialRiskEventFilters(serverSearch = "") {
  const params = readCurrentSearchParams(serverSearch);

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
