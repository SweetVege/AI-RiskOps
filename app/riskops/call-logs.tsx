import { AlertOctagon, ClipboardList, Gauge, ListFilter, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { type CallLogDetailApi, type CallLogListItemApi, type PaginationApi } from "@/app/riskops/api-types";
import { CallLogDetail, CallLogRow, StatCard } from "@/app/riskops/components";
import { type UserProfile } from "@/app/riskops/config";
import {
  mapCallLogDetail,
  mapCallLogListItem,
  mapLinkedRiskEvent,
  profileQueryValue,
} from "@/app/riskops/mappers";
import { type AiCallLog, type RiskEvent } from "@/lib/risk-data";

export function CallLogsView({
  currentProfile,
  selectedLogId,
  onSelect,
}: {
  currentProfile: UserProfile;
  selectedLogId: string;
  onSelect: (id: string) => void;
}) {
  const [logs, setLogs] = useState<AiCallLog[]>([]);
  const [detailLog, setDetailLog] = useState<AiCallLog | null>(null);
  const [linkedEvent, setLinkedEvent] = useState<RiskEvent | undefined>();
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pagination, setPagination] = useState<PaginationApi | null>(null);
  const selectedLog = detailLog ?? logs.find((log) => log.id === selectedLogId) ?? logs[0];

  useEffect(() => {
    const controller = new AbortController();

    async function loadCallLogs() {
      setIsListLoading(true);
      setListError(null);

      try {
        const profile = profileQueryValue(currentProfile);
        const params = new URLSearchParams({
          profile,
          page_number: `${pageNumber}`,
          page_size: "50",
        });
        const response = await fetch(`/api/call-logs?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load call logs.");

        const payload = (await response.json()) as {
          data: CallLogListItemApi[];
          pagination?: PaginationApi;
        };
        const nextLogs = payload.data.map(mapCallLogListItem);
        setLogs(nextLogs);
        setPagination(payload.pagination ?? null);

        if (nextLogs.length && !nextLogs.some((log) => log.id === selectedLogId)) {
          onSelect(nextLogs[0].id);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setListError(error instanceof Error ? error.message : "Unable to load call logs.");
        setLogs([]);
        setPagination(null);
      } finally {
        setIsListLoading(false);
      }
    }

    loadCallLogs();

    return () => controller.abort();
  }, [currentProfile, onSelect, pageNumber, selectedLogId]);

  useEffect(() => {
    if (!selectedLogId) {
      setDetailLog(null);
      setLinkedEvent(undefined);
      return;
    }

    const controller = new AbortController();

    async function loadCallLogDetail() {
      setIsDetailLoading(true);
      setDetailError(null);

      try {
        const profile = profileQueryValue(currentProfile);
        const response = await fetch(`/api/call-logs/${selectedLogId}?profile=${profile}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load call detail.");

        const payload = (await response.json()) as { data: CallLogDetailApi };
        setDetailLog(mapCallLogDetail(payload.data));
        setLinkedEvent(
          payload.data.linkedRiskEvent
            ? mapLinkedRiskEvent(payload.data.linkedRiskEvent, payload.data)
            : undefined,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(error instanceof Error ? error.message : "Unable to load call detail.");
        setDetailLog(null);
        setLinkedEvent(undefined);
      } finally {
        setIsDetailLoading(false);
      }
    }

    loadCallLogDetail();

    return () => controller.abort();
  }, [currentProfile, selectedLogId]);

  return (
    <div className="p-6">
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Logs"
          value={`${pagination?.totalItems ?? logs.length}`}
          delta="Model request logs in the current access scope"
          icon={ClipboardList}
          tone="bg-cyan-50 text-cyan-700"
        />
        <StatCard
          title="Linked Risk Event"
          value={`${logs.filter((log) => log.eventId).length}`}
          delta="Calls traceable to risk events in the current sample"
          icon={AlertOctagon}
          tone="bg-rose-50 text-rose-700"
        />
        <StatCard
          title="Blocked Calls"
          value={`${logs.filter((log) => log.action === "block").length}`}
          delta="Model requests where the system action was block"
          icon={Shield}
          tone="bg-violet-50 text-violet-700"
        />
        <StatCard
          title="Average Call Risk Score"
          value={`${Math.round(logs.reduce((sum, log) => sum + log.score, 0) / Math.max(logs.length, 1))}`}
          delta="Calculated from call logs, not the same as average event score"
          icon={Gauge}
          tone="bg-amber-50 text-amber-700"
        />
      </section>

      <section className="mt-5 grid grid-cols-[1.35fr_0.95fr] gap-5">
        <div>
          <section className="rounded-lg border border-line bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-ink">AI Call Logs</h2>
                <p className="text-xs text-slate-500">
                  Trace each model request, system action, and linked risk event
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {pagination
                    ? `${logs.length} shown · ${pagination.totalItems} total · Page ${pagination.page} of ${pagination.totalPages}`
                    : `${logs.length} shown`}
                </p>
              </div>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
                <ListFilter className="h-4 w-4" />
                Filter
              </button>
            </div>
            <div className="grid grid-cols-[92px_1fr_104px_76px_92px_96px_28px] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
              <span>Time</span>
              <span>App / User</span>
              <span>Environment</span>
              <span>Risk Score</span>
              <span>System Action</span>
              <span>Risk Events</span>
              <span />
            </div>
            <div>
              {listError ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-rose-700">{listError}</p>
                </div>
              ) : isListLoading && !logs.length ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">Loading call logs...</p>
                </div>
              ) : logs.length ? logs.map((log) => (
                <CallLogRow
                  key={log.id}
                  log={log}
                  selected={log.id === selectedLogId}
                  onSelect={() => onSelect(log.id)}
                />
              )) : (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-ink">No call logs in the current access scope.</p>
                  <p className="mt-1 text-xs text-slate-500">Change the user profile or application scope to view logs.</p>
                </div>
              )}
            </div>
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
          </section>
        </div>

        {selectedLog ? (
          <div>
            {detailError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {detailError}
              </div>
            ) : null}
            {isDetailLoading && !detailLog ? (
              <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
                <p className="text-sm font-semibold text-ink">Loading Call Detail</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Fetching source prompt, model output, RAG context, and linked risk event from the backend API.
                </p>
              </aside>
            ) : (
              <CallLogDetail log={selectedLog} event={linkedEvent} />
            )}
          </div>
        ) : (
          <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-sm font-semibold text-ink">No Call Selected</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              There are no call logs available for the current access scope.
            </p>
          </aside>
        )}
      </section>
    </div>
  );
}
