/**
 * Unauthenticated layout — sign-in / sign-up shell. Day-12 Cockpit reset.
 *
 * Two-column desktop layout. Left: brand + quiet operator-grade
 * manifesto. Right: the auth form (Clerk component themed via
 * appearance prop in the page itself). Single accent green is
 * reserved for the primary submit button inside the form.
 *
 * On mobile the left column collapses; the right column fills.
 */

import type { ReactNode } from "react";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="grid h-dvh bg-[#0A0A0B] lg:grid-cols-2">
    {/* Left: brand + manifesto */}
    <aside className="relative hidden flex-col justify-between border-white/[0.06] border-r p-12 lg:flex">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#56C870]/20 bg-[#56C870]/[0.06]">
          <span className="font-mono font-semibold text-[#56C870] text-[11px]">
            ai
          </span>
        </div>
        <span className="font-semibold text-[13px] text-zinc-300 tracking-tight">
          CFO
        </span>
      </div>

      <div className="space-y-6">
        <p className="font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
          AN AI CFO FOR OPERATORS
        </p>
        <h1 className="max-w-[460px] font-light text-[40px] text-zinc-50 leading-[1.15] tracking-[-0.02em]">
          Every cent verified against Stripe.
          <br />
          <span className="text-zinc-500">
            Every number cites the row it came from.
          </span>
        </h1>
        <p className="max-w-[420px] text-[14px] text-zinc-500 leading-[1.7]">
          Refund spikes, attribution drift, missing Stripe charges — caught the
          morning after. Plain English, with receipts.
        </p>
      </div>

      <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-wider">
        v0 · invite-only
      </p>
    </aside>

    {/* Right: auth form */}
    <main className="flex items-center justify-center px-6 py-12 lg:px-12">
      <div className="w-full max-w-[420px]">{children}</div>
    </main>
  </div>
);

export default AuthLayout;
