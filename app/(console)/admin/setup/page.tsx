import { ApplicationSetupPage } from "@/app/riskops/pages";
import { requirePage } from "@/lib/console-session";

export default async function Page() {
  await requirePage("/admin/setup");

  return <ApplicationSetupPage />;
}
