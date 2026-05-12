import { auth, currentUser } from "@ai-cfo/auth/server";
import { secure } from "@ai-cfo/security";
import type { ReactNode } from "react";
import { env } from "@/env";
import { CockpitSidebar } from "./components/cockpit-sidebar";

interface AppLayoutProperties {
  readonly children: ReactNode;
}

/**
 * Day-11 authenticated shell. The Cockpit sidebar (a 200px fixed rail
 * with five plain-text nav items) replaces the previous Radix Sidebar.
 * The page itself sets the dark Cockpit chrome (#131316) — we no longer
 * thread alert badges into the sidebar; "Needs your attention" inside
 * each page owns that signal.
 */
const AppLayout = async ({ children }: AppLayoutProperties) => {
  if (env.ARCJET_KEY) {
    await secure(["CATEGORY:PREVIEW"]);
  }

  const user = await currentUser();
  const { redirectToSignIn } = await auth();

  if (!user) {
    return redirectToSignIn();
  }

  return <CockpitSidebar>{children}</CockpitSidebar>;
};

export default AppLayout;
