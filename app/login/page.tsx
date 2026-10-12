import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { signInWithGitHub } from "@/app/login/actions";
import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isDemoMode() || (await getSessionUser())) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-panel px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-ink" />
          <h1 className="text-lg font-semibold text-ink">AI RiskOps</h1>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in to view AI application risk posture, events, and call logs for your organization.
        </p>
        <form action={signInWithGitHub} className="mt-6">
          <button
            type="submit"
            className="h-10 w-full rounded-lg bg-ink text-sm font-semibold text-white hover:opacity-90"
          >
            Sign in with GitHub
          </button>
        </form>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          New accounts have no access until a Platform Admin assigns a permission set.
        </p>
      </div>
    </main>
  );
}
