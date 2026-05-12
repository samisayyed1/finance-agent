/**
 * /analyst — Day-11 Cockpit shell. All chrome lives inside AnalystChat
 * (the Stitch design centers its own header). The page is a thin
 * server-component auth gate.
 */

import { auth } from "@ai-cfo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalystChat } from "./components/analyst-chat";

export const metadata: Metadata = {
  title: "Ask",
  description: "Ask your CFO anything. The answer cites every receipt.",
};

const AnalystPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }
  return <AnalystChat />;
};

export default AnalystPage;
