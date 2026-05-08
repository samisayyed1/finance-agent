/**
 * /analyst — browser chat with the operating CFO. Server shell.
 */

import { auth } from "@ai-cfo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalystChat } from "./components/analyst-chat";

export const metadata: Metadata = {
  title: "Analyst — AI CFO",
  description: "Ask your CFO anything.",
};

const AnalystPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <header>
        <h1 className="font-semibold text-2xl">Ask your CFO anything</h1>
        <p className="text-muted-foreground text-sm">
          Conversational analyst. Cites every claim with a snapshot, flag,
          anomaly, or memory id.
        </p>
      </header>
      <AnalystChat />
    </div>
  );
};

export default AnalystPage;
