"use client";

/**
 * The Cockpit sidebar. Day-11 visual reset to match the Stitch-designed
 * AI CFO home: a 200px fixed-width rail with five plain-text nav items,
 * a quiet brand mark at the top, and the org switcher pinned to the
 * bottom. No collapsible chrome, no alert badges — the operator's
 * attention belongs to the page content (the "Needs your attention"
 * card stack), not to peripheral pills.
 */

import { OrganizationSwitcher } from "@ai-cfo/auth/client";
import { cn } from "@ai-cfo/design-system/lib/utils";
import {
  ClockIcon,
  HomeIcon,
  MessageSquareIcon,
  SettingsIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly href: string;
  readonly icon: IconType;
  readonly matchPaths: readonly string[];
  readonly title: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { title: "Today", href: "/", icon: HomeIcon, matchPaths: ["/", "/today"] },
  {
    title: "Money",
    href: "/metrics",
    icon: WalletIcon,
    matchPaths: ["/metrics"],
  },
  {
    title: "Ask",
    href: "/analyst",
    icon: MessageSquareIcon,
    matchPaths: ["/analyst"],
  },
  {
    title: "History",
    href: "/exports",
    icon: ClockIcon,
    matchPaths: ["/exports"],
  },
  {
    title: "Settings",
    href: "/settings/connections",
    icon: SettingsIcon,
    matchPaths: ["/settings"],
  },
];

const isActive = (pathname: string, item: NavItem): boolean =>
  item.matchPaths.some(
    (path) =>
      pathname === path ||
      (path !== "/" && pathname.startsWith(`${path}/`)) ||
      (path === "/" && pathname === "/today")
  );

export const CockpitSidebar = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#131316] text-[#E4E1E6]">
      <aside className="fixed top-0 left-0 z-30 flex h-screen w-[200px] flex-col border-white/5 border-r bg-[#131316] px-4 py-6">
        <Link className="mb-12 flex items-center gap-3 px-2" href="/">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#56C870]/20 bg-[#56C870]/[0.06]">
            <span className="font-mono font-semibold text-[#56C870] text-[11px]">
              ai
            </span>
          </div>
          <span className="font-semibold text-[13px] text-zinc-300 tracking-tight">
            CFO
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-7">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <Link
                className={cn(
                  "-ml-[18px] flex items-center gap-3 border-transparent border-l-2 pl-[14px] transition-colors duration-150",
                  active
                    ? "border-[#56C870] text-zinc-50"
                    : "text-[#BDCABA] hover:text-zinc-50"
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
                <span
                  className={cn(
                    "text-[14px] tracking-tight",
                    active ? "font-semibold" : "font-medium"
                  )}
                >
                  {item.title}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-white/5 border-t px-2 pt-4">
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
          />
          {/* Quiet keyboard hint — the kind of detail Linear ships and
              amateurs miss. No interaction yet; just signals "this is a
              real tool, not a toy." */}
          <div className="flex items-center justify-between text-[10px] text-zinc-600">
            <span>Ask anything</span>
            <kbd className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </div>
        </div>
      </aside>

      <main className="ml-[200px] min-h-screen flex-1">{children}</main>
    </div>
  );
};
