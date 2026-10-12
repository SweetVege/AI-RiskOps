import { redirect } from "next/navigation";
import { signOutAction } from "@/app/login/actions";
import RiskOpsApp, { type AppSession } from "@/app/riskops-app";
import { permissionsForScope } from "@/lib/api/permissions";
import { resolveUserScope, type ApiProfile } from "@/lib/api/scope";
import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

const profileLabels: Record<ApiProfile, AppSession["profile"]> = {
  "global-user": "Global User",
  "app-owner": "App Owner",
  "platform-admin": "Platform Admin",
};

export default async function Page() {
  if (isDemoMode()) {
    return <RiskOpsApp session={{ demoMode: true, profile: "Platform Admin", user: null }} />;
  }

  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const scope = await resolveUserScope(user);
  const permissions = await permissionsForScope(scope);

  if (!permissions.canViewOverview) {
    return (
      <main className="grid min-h-screen place-items-center bg-panel px-6">
        <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8">
          <h1 className="text-lg font-semibold text-ink">Access pending</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You are signed in as {user.email}, but no permission set has been assigned yet. Ask a Platform Admin
            to grant access in Admin &rarr; User Access.
          </p>
          <form action={signOutAction} className="mt-6">
            <button
              type="submit"
              className="h-10 w-full rounded-lg border border-line bg-white text-sm font-semibold text-ink hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  return <RiskOpsApp session={{ demoMode: false, profile: profileLabels[scope.profile], user }} />;
}
