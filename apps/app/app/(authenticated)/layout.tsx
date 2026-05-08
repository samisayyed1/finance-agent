import { auth, currentUser } from "@ai-cfo/auth/server";
import {
  and,
  connectionAlerts,
  database,
  eq,
  inArray,
  isNull,
  reconciliationFlags,
  sql,
} from "@ai-cfo/database";
import { SidebarProvider } from "@ai-cfo/design-system/components/ui/sidebar";
import { showBetaFeature } from "@ai-cfo/feature-flags";
import { secure } from "@ai-cfo/security";
import type { ReactNode } from "react";
import { env } from "@/env";
import { GlobalSidebar, type SidebarAlertCounts } from "./components/sidebar";

interface AppLayoutProperties {
  readonly children: ReactNode;
}

const ZERO_COUNTS: SidebarAlertCounts = { connections: 0, reconciliation: 0 };

const fetchAlertCounts = async (orgId: string): Promise<SidebarAlertCounts> => {
  // Wrap in try/catch so a transient DB hiccup doesn't take down every
  // authenticated route. The badges are diagnostic, not critical.
  try {
    const [connRow] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(connectionAlerts)
      .where(
        and(
          eq(connectionAlerts.orgId, orgId),
          isNull(connectionAlerts.resolvedAt)
        )
      );
    const [flagRow] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(reconciliationFlags)
      .where(
        and(
          eq(reconciliationFlags.orgId, orgId),
          inArray(reconciliationFlags.status, ["open", "investigating"])
        )
      );
    return {
      connections: connRow?.count ?? 0,
      reconciliation: flagRow?.count ?? 0,
    };
  } catch {
    return ZERO_COUNTS;
  }
};

const AppLayout = async ({ children }: AppLayoutProperties) => {
  if (env.ARCJET_KEY) {
    await secure(["CATEGORY:PREVIEW"]);
  }

  const user = await currentUser();
  const { orgId, redirectToSignIn } = await auth();
  const betaFeature = await showBetaFeature();

  if (!user) {
    return redirectToSignIn();
  }

  const alertCounts = orgId ? await fetchAlertCounts(orgId) : ZERO_COUNTS;

  return (
    <SidebarProvider>
      <GlobalSidebar alertCounts={alertCounts}>
        {betaFeature && (
          <div className="m-4 rounded-full bg-blue-500 p-1.5 text-center text-sm text-white">
            Beta feature now available
          </div>
        )}
        {children}
      </GlobalSidebar>
    </SidebarProvider>
  );
};

export default AppLayout;
