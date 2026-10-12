import { Activity, AlertOctagon, Gauge, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/app/riskops/api";
import { type RiskEventSavedView } from "@/app/riskops/analytics-shared";
import {
  type PaginationApi,
  type RiskEventDetailApi,
  type RiskEventListItemApi,
} from "@/app/riskops/api-types";
import { EventDetail, ReviewStatusPill, StatCard } from "@/app/riskops/components";
import { type UserProfile, riskEventSavedViewsStorageKey } from "@/app/riskops/config";
import {
  mapRiskEventDetail,
  mapRiskEventListItem,
  profileQueryValue,
  titleCaseStatus,
} from "@/app/riskops/mappers";
import {
  readCurrentSearchParams,
  readInitialRiskEventFilters,
  replaceUrlParams,
} from "@/app/riskops/navigation";
import { type ReviewStatus, type RiskEvent, actionMeta, levelMeta } from "@/lib/risk-data";

export function RiskEventsWorkbench({
  currentProfile,
  selectedId,
  onSelect,
  initialSearch,
}: {
  currentProfile: UserProfile;
  selectedId: string;
  onSelect: (id: string) => void;
  initialSearch: string;
}) {
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [detailEvent, setDetailEvent] = useState<RiskEvent | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => readInitialRiskEventFilters(initialSearch).q);
  const [levelFilter, setLevelFilter] = useState(() => readInitialRiskEventFilters(initialSearch).level);
  const [actionFilter, setActionFilter] = useState(() => readInitialRiskEventFilters(initialSearch).action);
  const [reviewFilter, setReviewFilter] = useState(() => readInitialRiskEventFilters(initialSearch).reviewStatus);
  const [applicationIdFilter, setApplicationIdFilter] = useState(() => readInitialRiskEventFilters(initialSearch).applicationId);
  const [environmentFilter, setEnvironmentFilter] = useState(() => readInitialRiskEventFilters(initialSearch).environment);
  const [pageNumber, setPageNumber] = useState(1);
  const [pagination, setPagination] = useState<PaginationApi | null>(null);
  const [drillThroughLabel, setDrillThroughLabel] = useState(() => {
    const initialFilters = readInitialRiskEventFilters(initialSearch);
    return initialFilters.source && initialFilters.label
      ? `${initialFilters.source}: ${initialFilters.label}`
      : "";
  });
  const [savedViews, setSavedViews] = useState<RiskEventSavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const hasActiveFilters =
    searchQuery.trim() ||
    levelFilter !== "All" ||
    actionFilter !== "All" ||
    reviewFilter !== "All" ||
    applicationIdFilter ||
    environmentFilter;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawViews = window.localStorage.getItem(riskEventSavedViewsStorageKey);
    if (!rawViews) return;

    try {
      const parsedViews = JSON.parse(rawViews);
      if (!Array.isArray(parsedViews)) return;

      setSavedViews(
        parsedViews
          .filter((view): view is RiskEventSavedView => {
            return (
              typeof view === "object" &&
              view !== null &&
              typeof view.id === "string" &&
              typeof view.name === "string"
            );
          })
          .map((view) => ({
            id: view.id,
            name: view.name,
            q: typeof view.q === "string" ? view.q : "",
            level: typeof view.level === "string" ? view.level : "All",
            action: typeof view.action === "string" ? view.action : "All",
            reviewStatus: typeof view.reviewStatus === "string" ? view.reviewStatus : "All",
            applicationId: typeof view.applicationId === "string" ? view.applicationId : "",
            environment: typeof view.environment === "string" ? view.environment : "",
            sourceLabel: typeof view.sourceLabel === "string" ? view.sourceLabel : "",
            createdAt: typeof view.createdAt === "string" ? view.createdAt : new Date().toISOString(),
          })),
      );
    } catch {
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(riskEventSavedViewsStorageKey, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    setPageNumber(1);
  }, [actionFilter, applicationIdFilter, environmentFilter, levelFilter, reviewFilter, searchQuery]);

  useEffect(() => {
    const params = readCurrentSearchParams();

    if (levelFilter !== "All") params.set("level", levelFilter);
    else params.delete("level");

    if (actionFilter !== "All") params.set("action", actionFilter);
    else params.delete("action");

    if (reviewFilter !== "All") params.set("review_status", reviewFilter);
    else params.delete("review_status");

    if (applicationIdFilter) params.set("application_id", applicationIdFilter);
    else params.delete("application_id");

    if (environmentFilter) params.set("environment", environmentFilter);
    else params.delete("environment");

    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    else params.delete("q");

    if (drillThroughLabel) {
      const [source, ...labelParts] = drillThroughLabel.split(": ");
      params.set("source", source);
      params.set("label", labelParts.join(": "));
    } else {
      params.delete("source");
      params.delete("label");
    }

    replaceUrlParams(params);
  }, [
    actionFilter,
    applicationIdFilter,
    drillThroughLabel,
    environmentFilter,
    levelFilter,
    reviewFilter,
    searchQuery,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ profile: profileQueryValue(currentProfile) });
    params.set("page_number", `${pageNumber}`);
    params.set("page_size", "50");

    if (levelFilter !== "All") params.set("level", levelFilter);
    if (actionFilter !== "All") params.set("action", actionFilter);
    if (reviewFilter !== "All") params.set("review_status", reviewFilter);
    if (applicationIdFilter) params.set("application_id", applicationIdFilter);
    if (environmentFilter) params.set("environment", environmentFilter);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());

    async function loadEvents() {
      setIsListLoading(true);
      setListError(null);

      try {
        const payload = await apiRequest<{
          data: RiskEventListItemApi[];
          pagination?: PaginationApi;
        }>("/api/risk-events", {
          query: params,
          signal: controller.signal,
          errorMessage: "Unable to load risk events",
        });
        const mappedEvents = payload.data.map(mapRiskEventListItem);
        setEvents(mappedEvents);
        setPagination(payload.pagination ?? null);

        if (mappedEvents.length && !mappedEvents.some((event) => event.id === selectedId)) {
          onSelect(mappedEvents[0].id);
        }
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setListError("Unable to load risk events from the backend API.");
          setEvents([]);
          setPagination(null);
          setDetailEvent(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsListLoading(false);
        }
      }
    }

    loadEvents();

    return () => controller.abort();
  }, [
    actionFilter,
    applicationIdFilter,
    currentProfile,
    environmentFilter,
    levelFilter,
    onSelect,
    pageNumber,
    reviewFilter,
    searchQuery,
    selectedId,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const selectedListEvent = events.find((event) => event.id === selectedId);

    if (!selectedListEvent) {
      setDetailEvent(null);
      return () => controller.abort();
    }

    async function loadEventDetail() {
      setIsDetailLoading(true);
      setDetailError(null);

      try {
        const payload = await apiRequest<{ data: RiskEventDetailApi }>(`/api/risk-events/${selectedId}`, {
          profile: currentProfile,
          signal: controller.signal,
          errorMessage: "Unable to load risk event detail",
        });
        setDetailEvent(mapRiskEventDetail(payload.data));
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setDetailError("Unable to load risk event detail from the backend API.");
          setDetailEvent(selectedListEvent ?? null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsDetailLoading(false);
        }
      }
    }

    loadEventDetail();

    return () => controller.abort();
  }, [currentProfile, events, selectedId]);

  const visibleSelectedEvent = detailEvent ?? events.find((event) => event.id === selectedId) ?? events[0];
  const pendingCount = events.filter((event) => event.reviewStatus === "pending_review").length;
  const inProgressCount = events.filter((event) =>
    event.reviewStatus === "in_progress" || event.reviewStatus === "in_review",
  ).length;
  const confirmedCount = events.filter((event) => event.reviewStatus === "confirmed").length;
  const falsePositiveCount = events.filter((event) => event.reviewStatus === "false_positive").length;
  const saveCurrentView = () => {
    const fallbackName = drillThroughLabel || searchQuery.trim() || "Filtered Risk Events";
    const viewName = savedViewName.trim() || fallbackName;
    const nextView: RiskEventSavedView = {
      id: `${Date.now()}`,
      name: viewName,
      q: searchQuery.trim(),
      level: levelFilter,
      action: actionFilter,
      reviewStatus: reviewFilter,
      applicationId: applicationIdFilter,
      environment: environmentFilter,
      sourceLabel: drillThroughLabel,
      createdAt: new Date().toISOString(),
    };

    setSavedViews((currentViews) => [
      nextView,
      ...currentViews.filter((view) => view.name.toLowerCase() !== viewName.toLowerCase()),
    ].slice(0, 8));
    setSavedViewName("");
  };
  const applySavedView = (view: RiskEventSavedView) => {
    setSearchQuery(view.q);
    setLevelFilter(view.level || "All");
    setActionFilter(view.action || "All");
    setReviewFilter(view.reviewStatus || "All");
    setApplicationIdFilter(view.applicationId);
    setEnvironmentFilter(view.environment);
    setDrillThroughLabel(`Saved View: ${view.name}`);
  };
  const deleteSavedView = (id: string) => {
    setSavedViews((currentViews) => currentViews.filter((view) => view.id !== id));
  };
  const updateReviewMetadata = async (input: { reviewStatus: ReviewStatus; owner: string }) => {
    if (!visibleSelectedEvent) return;

    setIsReviewSaving(true);
    setDetailError(null);

    try {
      const payload = await apiRequest<{
        data?: RiskEventDetailApi;
        error?: string;
      }>(`/api/risk-events/${visibleSelectedEvent.id}`, {
        profile: currentProfile,
        method: "PATCH",
        body: input,
        errorMessage: "Unable to update review metadata.",
      });

      if (!payload?.data) {
        throw new Error("Unable to update review metadata.");
      }

      const updatedEvent = mapRiskEventDetail(payload.data);
      setDetailEvent(updatedEvent);
      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === updatedEvent.id
            ? {
                ...event,
                reviewStatus: updatedEvent.reviewStatus,
                owner: updatedEvent.owner,
                updatedAt: updatedEvent.updatedAt,
              }
            : event,
        ),
      );
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unable to update review metadata.");
    } finally {
      setIsReviewSaving(false);
    }
  };
  const clearFilters = () => {
    setSearchQuery("");
    setLevelFilter("All");
    setActionFilter("All");
    setReviewFilter("All");
    setApplicationIdFilter("");
    setEnvironmentFilter("");
    setDrillThroughLabel("");
    setPageNumber(1);
  };
  const pageSummary = pagination
    ? `${events.length} shown · ${pagination.totalItems} total`
    : `${events.length} shown`;

  return (
    <div className="p-6">
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          title="Pending Review"
          value={`${pendingCount}`}
          delta="Risk events not yet confirmed by security or risk reviewers"
          icon={AlertOctagon}
          tone="bg-amber-50 text-amber-700"
        />
        <StatCard
          title="In Progress"
          value={`${inProgressCount}`}
          delta="Owner has started investigation or contacted the business team"
          icon={Activity}
          tone="bg-cyan-50 text-cyan-700"
        />
        <StatCard
          title="Confirmed"
          value={`${confirmedCount}`}
          delta="Events confirmed as real risks after review"
          icon={ShieldCheck}
          tone="bg-rose-50 text-rose-700"
        />
        <StatCard
          title="False Positive"
          value={`${falsePositiveCount}`}
          delta="Used for rule tuning and policy calibration"
          icon={Gauge}
          tone="bg-slate-100 text-slate-700"
        />
      </section>

      <section className="mt-5 grid grid-cols-[1.4fr_0.9fr] gap-5">
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink">Risk Event Workbench</h2>
                <p className="text-xs text-slate-500">
                  Inspect AI risk events by severity, review metadata, ownership, and SLA
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {isListLoading ? "Loading..." : pageSummary}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[118px_132px_156px_92px] gap-3">
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
              >
                <option value="All">All Levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="severe">Severe</option>
              </select>
              <select
                value={actionFilter}
                onChange={(event) => setActionFilter(event.target.value)}
                className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
              >
                <option value="All">All Actions</option>
                <option value="allow">Allow</option>
                <option value="flag">Flag</option>
                <option value="redact">Redact</option>
                <option value="review">Human Review</option>
                <option value="block">Block</option>
              </select>
              <select
                value={reviewFilter}
                onChange={(event) => setReviewFilter(event.target.value)}
                className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
              >
                <option value="All">All Review States</option>
                <option value="pending_review">Pending Review</option>
                <option value="in_review">In Review</option>
                <option value="in_progress">In Progress</option>
                <option value="confirmed">Confirmed</option>
                <option value="false_positive">False Positive</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </select>
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Clear
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search title, app, user, owner, department, or rule ID"
                className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-slate-400"
              />
            </div>
            {drillThroughLabel ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs">
                <span className="font-medium text-sky-800">
                  Applied from {drillThroughLabel}
                </span>
                <span className="text-sky-700">
                  {applicationIdFilter ? "Application scoped" : null}
                  {applicationIdFilter && environmentFilter ? " · " : null}
                  {environmentFilter ? `${titleCaseStatus(environmentFilter)} environment` : null}
                </span>
              </div>
            ) : null}
            <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved Views</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Save reusable filter sets for repeated risk investigation views.
                  </p>
                </div>
                <div className="flex min-w-[280px] items-center gap-2">
                  <input
                    value={savedViewName}
                    onChange={(event) => setSavedViewName(event.target.value)}
                    placeholder="View name"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={saveCurrentView}
                    disabled={!hasActiveFilters && !drillThroughLabel}
                    className="h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Save View
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {savedViews.length ? savedViews.map((view) => (
                  <span
                    key={view.id}
                    className="inline-flex items-center overflow-hidden rounded-full border border-line bg-white text-xs shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => applySavedView(view)}
                      className="px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedView(view.id)}
                      aria-label={`Delete ${view.name}`}
                      className="border-l border-line px-2 py-1.5 font-semibold text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      Delete
                    </button>
                  </span>
                )) : (
                  <span className="text-xs text-slate-500">
                    No saved views yet. Apply filters, then save the current view.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div>
            <div className="grid grid-cols-[1fr_92px_112px_76px] items-center gap-4 border-b border-line bg-panel px-4 py-2 text-xs font-semibold text-slate-500">
              <span>Risk Event</span>
              <span>Risk Level</span>
              <span>Risk Status</span>
              <span>SLA</span>
            </div>
            {listError ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-rose-700">{listError}</p>
              </div>
            ) : isListLoading && !events.length ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-600">Loading risk events...</p>
              </div>
            ) : events.length ? events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelect(event.id)}
                className={`grid w-full grid-cols-[1fr_92px_112px_76px] items-center gap-4 border-b border-line px-4 py-4 text-left transition hover:bg-slate-50 ${
                  event.id === selectedId ? "bg-slate-50" : "bg-white"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold text-ink">
                    {event.title}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {event.time} · {event.app} · {event.user}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    Rules: {event.rules.join(", ")} · Owner: {event.owner} · Action: {actionMeta[event.action].label}
                  </span>
                </span>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                    levelMeta[event.level].className
                  }`}
                >
                  {levelMeta[event.level].label} · {event.score}
                </span>
                <ReviewStatusPill status={event.reviewStatus} />
                <span className="text-sm text-slate-600">{event.sla}</span>
              </button>
            )) : (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-ink">No events match the current filters.</p>
                <p className="mt-1 text-xs text-slate-500">Adjust the search or filter controls.</p>
              </div>
            )}
            {pagination && pagination.totalItems > pagination.pageSize ? (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-slate-500">
                <span>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPageNumber((currentPage) => Math.max(1, currentPage - 1))}
                    disabled={!pagination.hasPreviousPage || isListLoading}
                    className="h-8 rounded-lg border border-line bg-white px-3 font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageNumber((currentPage) => currentPage + 1)}
                    disabled={!pagination.hasNextPage || isListLoading}
                    className="h-8 rounded-lg border border-line bg-white px-3 font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {visibleSelectedEvent ? (
          <div>
            {detailError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {detailError}
              </div>
            ) : null}
            {isDetailLoading && !detailEvent ? (
              <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
                <p className="text-sm font-semibold text-ink">Loading Risk Event Detail</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Fetching matched rules, evidence, and source context from the backend API.
                </p>
              </aside>
            ) : (
              <EventDetail
                event={visibleSelectedEvent}
                canUpdateReview={currentProfile !== "App Owner"}
                isReviewSaving={isReviewSaving}
                onUpdateReview={updateReviewMetadata}
              />
            )}
          </div>
        ) : (
          <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-sm font-semibold text-ink">No Risk Event Selected</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              There are no risk events available for the current filters and user profile.
            </p>
          </aside>
        )}
      </section>
    </div>
  );
}
