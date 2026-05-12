import { Status } from "@ai-cfo/observability/status";
import Link from "next/link";
import { env } from "@/env";

/**
 * AI-CFO marketing-site footer. Trimmed to the essentials: brand,
 * status indicator, and a single sign-in CTA. The next-forge
 * navigationItems sprawl (Blog / Legal / Docs) was wired to BaseHub
 * CMS, which we dropped on Day 10 — bring it back as a CMS-isolated
 * `/blog` subroute when there's content worth indexing.
 */
export const Footer = () => (
  <footer className="border-t bg-background">
    <div className="container mx-auto flex flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <p className="font-semibold text-lg tracking-tight">AI Operating CFO</p>
        <p className="text-muted-foreground text-sm">
          © {new Date().getFullYear()} Tenet Labs. v0 · invite-only.
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <Status />
        {env.NEXT_PUBLIC_APP_URL ? (
          <Link
            className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
            href={env.NEXT_PUBLIC_APP_URL}
          >
            Sign in →
          </Link>
        ) : null}
      </div>
    </div>
  </footer>
);
