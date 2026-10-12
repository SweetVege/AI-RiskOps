import { redirect } from "next/navigation";
import { navQueryMap, navRoutes } from "@/app/riskops/navigation";
import { OverviewPage } from "@/app/riskops/pages";
import { requirePage } from "@/lib/console-session";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const { page, ...rest } = await searchParams;
  const legacyNav = typeof page === "string" ? navQueryMap[page] : undefined;

  // Links from before pages had their own routes look like /?page=risk-events&level=severe.
  if (legacyNav && legacyNav !== "Overview") {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(rest)) {
      for (const item of Array.isArray(value) ? value : [value ?? ""]) {
        query.append(key, item);
      }
    }

    redirect(query.size ? `${navRoutes[legacyNav]}?${query.toString()}` : navRoutes[legacyNav]);
  }

  await requirePage("/");

  return <OverviewPage />;
}
