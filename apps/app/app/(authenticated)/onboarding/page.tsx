/**
 * /onboarding — Day-11 Cockpit port from Stitch screen 2f62…527.
 *
 * First run after sign-up. NO sidebar — full-viewport centered card
 * deck with four connector buttons. The Shopify primary CTA is the
 * page's only filled button (Iron Rule of the design system).
 *
 * Real wiring: each "Connect <X>" button POSTs to
 * `${NEXT_PUBLIC_API_URL}/api/connections/<source>/initiate` — same
 * endpoint /settings/connections uses. After Shopify OAuth completes
 * and the first sync runs, the operator's redirect lands on /today.
 */

import { auth } from "@ai-cfo/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingConnectors } from "./components/onboarding-connectors";

export const metadata: Metadata = {
  title: "Connect your first store",
  description: "Plug in your first source. We'll have your briefing tomorrow.",
};

const OnboardingPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }

  return (
    // Override the authenticated layout's Cockpit sidebar with a
    // full-viewport hero. The `(authenticated)` group enforces auth;
    // we negate the sidebar's 200px offset by absolute-positioning the
    // page over the whole viewport.
    <div className="fixed inset-0 flex -translate-x-[100px] items-center justify-center bg-[#0A0A0B]">
      <main className="flex w-full max-w-[720px] flex-col items-start px-6 py-24">
        <div className="mb-12 flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#56C870]/20 bg-[#56C870]/[0.06]">
            <span className="font-mono font-semibold text-[#56C870] text-[11px]">
              ai
            </span>
          </div>
          <span className="font-semibold text-[13px] text-zinc-300 tracking-tight">
            CFO
          </span>
        </div>

        <p className="mb-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
          STEP 1 OF 3 · CONNECT YOUR DATA
        </p>
        <h1 className="mb-3 max-w-[620px] font-light text-[40px] text-zinc-50 leading-[1.1] tracking-[-0.02em]">
          Plug in your first store. We&apos;ll have your first briefing tomorrow
          morning.
        </h1>
        <p className="mb-12 max-w-[480px] text-[15px] text-zinc-400 leading-[1.6]">
          Shopify takes 20 seconds — OAuth then sync. The rest can come later;
          you only need one source to start.
        </p>

        <OnboardingConnectors />

        <Link
          className="mt-10 text-[13px] text-zinc-500 transition-colors hover:text-zinc-300"
          href="/?demo=1"
        >
          Just looking? See the demo brand →
        </Link>

        <div className="mt-12 flex items-center gap-3 self-center">
          <span className="h-[6px] w-[6px] rounded-full bg-[#56C870]" />
          <span className="h-[6px] w-[6px] rounded-full border border-white/[0.10]" />
          <span className="h-[6px] w-[6px] rounded-full border border-white/[0.10]" />
          <span className="ml-2 font-mono text-[10px] text-zinc-600 uppercase tracking-[0.16em]">
            STEP 1 / 3
          </span>
        </div>
      </main>
    </div>
  );
};

export default OnboardingPage;
