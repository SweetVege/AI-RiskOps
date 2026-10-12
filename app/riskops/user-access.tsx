import { Code2, Settings2, Shield, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type UserAccessApplicationApi,
  type UserAccessAuditLogApi,
  type UserAccessPermissionSetApi,
  type UserAccessSummaryApi,
  type UserAccessUserApi,
} from "@/app/riskops/api-types";
import { FieldLabel, StatCard } from "@/app/riskops/components";
import { type UserProfile } from "@/app/riskops/config";
import { formatApiDateTime, profileQueryValue } from "@/app/riskops/mappers";

export function formatDataScopeLabel(value: string) {
  return value === "assigned_applications" ? "Assigned Applications" : "Global";
}

export function formatCapabilityLabel(value: string) {
  return value
    .replace(/^can/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

export function formatAccessAction(value: string) {
  if (value === "user_access.updated") return "User access updated";
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function applicationScopeChangeLabel(previousIds: string[], nextIds: string[]) {
  const previousCount = previousIds.length;
  const nextCount = nextIds.length;

  if (!previousCount && !nextCount) return "Global scope";
  return `${previousCount} apps -> ${nextCount} apps`;
}

export function UserAccessAdmin({ currentProfile }: { currentProfile: UserProfile }) {
  const [summary, setSummary] = useState<UserAccessSummaryApi | null>(null);
  const [users, setUsers] = useState<UserAccessUserApi[]>([]);
  const [permissionSets, setPermissionSets] = useState<UserAccessPermissionSetApi[]>([]);
  const [applications, setApplications] = useState<UserAccessApplicationApi[]>([]);
  const [accessAuditLogs, setAccessAuditLogs] = useState<UserAccessAuditLogApi[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftPermissionSetId, setDraftPermissionSetId] = useState("");
  const [draftApplicationIds, setDraftApplicationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  async function loadUserAccess(signal?: AbortSignal) {
    setIsLoading(true);
    setError(null);

    try {
      const profile = encodeURIComponent(profileQueryValue(currentProfile));
      const response = await fetch(`/api/admin/user-access?profile=${profile}`, {
        cache: "no-store",
        signal,
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        summary?: UserAccessSummaryApi;
        data?: {
          users: UserAccessUserApi[];
          permissionSets: UserAccessPermissionSetApi[];
          applications: UserAccessApplicationApi[];
          accessAuditLogs?: UserAccessAuditLogApi[];
        };
      } | null;

      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error ?? "Unable to load user access configuration.");
      }

      setSummary(payload.summary ?? null);
      setUsers(payload.data.users);
      setPermissionSets(payload.data.permissionSets);
      setApplications(payload.data.applications);
      setAccessAuditLogs(payload.data.accessAuditLogs ?? []);

      const nextSelectedUser =
        payload.data.users.find((user) => user.id === selectedUserId) ?? payload.data.users[0] ?? null;
      setSelectedUserId(nextSelectedUser?.id ?? null);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load user access configuration.");
      setSummary(null);
      setUsers([]);
      setPermissionSets([]);
      setApplications([]);
      setAccessAuditLogs([]);
      setSelectedUserId(null);
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadUserAccess(controller.signal);

    return () => controller.abort();
  }, [currentProfile]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const selectedPermissionSet =
    permissionSets.find((permissionSet) => permissionSet.id === draftPermissionSetId) ??
    selectedUser?.permissionSet ??
    permissionSets[0] ??
    null;
  const requiresApplicationScope = selectedPermissionSet?.dataScope === "assigned_applications";
  const hasDraftChanges = Boolean(
    selectedUser &&
      (draftPermissionSetId !== (selectedUser.permissionSet?.id ?? "") ||
        draftApplicationIds.slice().sort().join(",") !==
          selectedUser.assignedApplications.map((application) => application.id).sort().join(",")),
  );

  useEffect(() => {
    if (!selectedUser) {
      setDraftPermissionSetId("");
      setDraftApplicationIds([]);
      return;
    }

    setDraftPermissionSetId(selectedUser.permissionSet?.id ?? "");
    setDraftApplicationIds(selectedUser.assignedApplications.map((application) => application.id));
    setSaveMessage(null);
  }, [selectedUser?.id]);

  function toggleDraftApplication(applicationId: string) {
    setDraftApplicationIds((current) =>
      current.includes(applicationId)
        ? current.filter((id) => id !== applicationId)
        : [...current, applicationId],
    );
  }

  async function saveUserAccess() {
    if (!selectedUser || !selectedPermissionSet) return;

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const profile = encodeURIComponent(profileQueryValue(currentProfile));
      const response = await fetch(`/api/admin/user-access?profile=${profile}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          permissionSetId: selectedPermissionSet.id,
          applicationIds: requiresApplicationScope ? draftApplicationIds : [],
        }),
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? "Unable to save user access configuration.");
      }

      setSaveMessage("User access saved.");
      await loadUserAccess();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save user access configuration.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {saveMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {saveMessage}
        </div>
      ) : null}

      <section className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={`${summary?.totalUsers ?? users.length}`}
          delta="Users currently represented in AI RiskOps access configuration"
          icon={Users}
          tone="bg-cyan-50 text-cyan-700"
        />
        <StatCard
          title="Permission Sets"
          value={`${summary?.permissionSets ?? permissionSets.length}`}
          delta="Reusable access packages mapped to product capabilities"
          icon={Shield}
          tone="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          title="App-Scoped Users"
          value={`${summary?.appScopedUsers ?? users.filter((user) => user.dataScope === "assigned_applications").length}`}
          delta="Users limited to assigned AI applications"
          icon={Code2}
          tone="bg-amber-50 text-amber-700"
        />
        <StatCard
          title="Admin Users"
          value={`${summary?.adminUsers ?? users.filter((user) => user.permissionSet?.capabilities.includes("canManageUserAccess")).length}`}
          delta="Users allowed to manage platform configuration"
          icon={Settings2}
          tone="bg-violet-50 text-violet-700"
        />
      </section>

      <section className="grid grid-cols-[1.15fr_0.85fr] gap-5">
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Users</h2>
              <p className="text-xs text-slate-500">
                Configure product-level permission sets and application visibility
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {isLoading ? "Loading" : "Backend-backed"}
            </span>
          </div>

          <div className="grid grid-cols-[1fr_128px_144px_128px_152px] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
            <span>User</span>
            <span>User Profile</span>
            <span>Permission Set</span>
            <span>Data Scope</span>
            <span>Assigned Apps</span>
          </div>
          <div>
            {isLoading && !users.length ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-600">Loading user access configuration...</p>
              </div>
            ) : users.length ? users.map((user) => {
              const isActive = user.id === selectedUser?.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className={`grid w-full grid-cols-[1fr_128px_144px_128px_152px] items-center gap-3 border-b border-line px-4 py-3 text-left text-sm ${
                    isActive ? "bg-sky-50" : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{user.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{user.email}</span>
                  </span>
                  <span className="truncate text-slate-600">{user.profile}</span>
                  <span className="truncate font-medium text-ink">{user.permissionSet?.name ?? "Unassigned"}</span>
                  <span className="truncate text-slate-600">{formatDataScopeLabel(user.dataScope)}</span>
                  <span className="truncate text-slate-600">
                    {user.dataScope === "assigned_applications"
                      ? `${user.assignedApplications.length} applications`
                      : "All applications"}
                  </span>
                </button>
              );
            }) : (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-ink">No users available.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
          {selectedUser ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected User</p>
                  <h2 className="mt-2 truncate text-lg font-semibold text-ink">{selectedUser.name}</h2>
                  <p className="mt-1 truncate text-xs text-slate-500">{selectedUser.email}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {formatDataScopeLabel(selectedPermissionSet?.dataScope ?? selectedUser.dataScope)}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <FieldLabel>Permission Set</FieldLabel>
                  <select
                    value={draftPermissionSetId}
                    onChange={(event) => {
                      const nextPermissionSet = permissionSets.find((permissionSet) => permissionSet.id === event.target.value);
                      setDraftPermissionSetId(event.target.value);
                      if (nextPermissionSet?.dataScope !== "assigned_applications") {
                        setDraftApplicationIds([]);
                      }
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
                  >
                    {permissionSets.map((permissionSet) => (
                      <option key={permissionSet.id} value={permissionSet.id}>
                        {permissionSet.name}
                      </option>
                    ))}
                  </select>
                  {selectedPermissionSet ? (
                    <p className="mt-2 text-xs leading-5 text-slate-500">{selectedPermissionSet.description}</p>
                  ) : null}
                </div>

                <section className="rounded-lg border border-line bg-panel p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">Capabilities</h3>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                      {selectedPermissionSet?.capabilities.length ?? 0}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedPermissionSet?.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
                      >
                        {formatCapabilityLabel(capability)}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-panel p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">Assigned Applications</h3>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                      {requiresApplicationScope ? `${draftApplicationIds.length} selected` : "Global scope"}
                    </span>
                  </div>
                  {requiresApplicationScope ? (
                    <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                      {applications.map((application) => {
                        const checked = draftApplicationIds.includes(application.id);
                        return (
                          <label
                            key={application.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                              checked ? "border-sky-200 bg-sky-50" : "border-line bg-white"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDraftApplication(application.id)}
                              className="h-4 w-4 rounded border-line text-ink"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink">{application.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">
                                {application.ownerTeam} · {application.slug}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg bg-white p-3 text-sm leading-6 text-slate-600">
                      This permission set can view global application data. Application-level assignment is cleared when saved.
                    </p>
                  )}
                </section>

                <button
                  type="button"
                  onClick={saveUserAccess}
                  disabled={
                    isSaving ||
                    !selectedPermissionSet ||
                    !hasDraftChanges ||
                    (requiresApplicationScope && draftApplicationIds.length === 0)
                  }
                  className="h-10 w-full rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSaving ? "Saving Access" : "Save User Access"}
                </button>
                <p className="text-xs leading-5 text-slate-500">
                  Permission changes affect backend API scope and Admin access immediately in this prototype.
                </p>
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-ink">No User Selected</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Select a user to review permission sets and application assignments.
              </p>
            </div>
          )}
        </aside>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Recent Access Changes</h2>
            <p className="text-xs text-slate-500">
              Latest permission-set and application-scope updates recorded by the backend
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {accessAuditLogs.length} records
          </span>
        </div>

        <div className="grid grid-cols-[136px_1fr_1fr_1fr_132px] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
          <span>Time</span>
          <span>Action</span>
          <span>Actor</span>
          <span>Permission Set</span>
          <span>App Scope</span>
        </div>

        {accessAuditLogs.length ? (
          <div>
            {accessAuditLogs.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-[136px_1fr_1fr_1fr_132px] items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0"
              >
                <span className="text-slate-600">{formatApiDateTime(log.occurredAt)}</span>
                <span className="truncate font-medium text-ink">{formatAccessAction(log.action)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-slate-700">{log.actorUserId}</span>
                  {log.actorProfile ? (
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{log.actorProfile}</span>
                  ) : null}
                </span>
                <span className="truncate text-slate-700">
                  {`${log.previousPermissionSet?.name ?? "Unassigned"} -> ${log.nextPermissionSet?.name ?? "Unassigned"}`}
                </span>
                <span className="truncate text-slate-600">
                  {applicationScopeChangeLabel(log.previousApplicationIds, log.nextApplicationIds)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-ink">No access changes recorded yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Saved User Access changes will appear here after the backend writes an audit record.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
