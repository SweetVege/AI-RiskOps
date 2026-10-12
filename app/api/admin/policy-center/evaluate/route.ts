import { authorizeRequest } from "@/lib/api/authorize";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { evaluateWithApplicationPolicy, policyEvaluationSchema } from "@/lib/policy/evaluate";

export const dynamic = "force-dynamic";

// A dry run: POST only because the sample can be long and may contain sensitive text that must not
// end up in a URL. Nothing is written, so it stays available in demo mode.
export async function POST(request: Request) {
  const access = await authorizeRequest(request, "canViewPolicyCenter", { readOnly: true });

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const parsed = policyEvaluationSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Sample call failed validation.", {
      issues: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }

  return apiOk({
    scope: scopeResponse(scope),
    data: await evaluateWithApplicationPolicy(scope, parsed.data),
  });
}
