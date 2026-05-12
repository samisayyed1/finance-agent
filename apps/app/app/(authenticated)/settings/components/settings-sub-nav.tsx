/**
 * Cockpit settings sub-navigation. A horizontal row of mono UPPERCASE
 * pill buttons. The active pill gets the accent-green hairline border
 * + zinc-50 text. NO fill — the discipline of the wider design system.
 */

import { cn } from "@ai-cfo/design-system/lib/utils";
import Link from "next/link";

type SettingsSection =
  | "connections"
  | "reconciliation"
  | "team"
  | "billing"
  | "notifications";

interface NavItem {
  readonly disabled?: boolean;
  readonly href: string;
  readonly id: SettingsSection;
  readonly label: string;
}

const ITEMS: readonly NavItem[] = [
  { id: "connections", label: "Connections", href: "/settings/connections" },
  {
    id: "reconciliation",
    label: "Reconciliation",
    href: "/settings/reconciliation",
  },
  { id: "team", label: "Team", href: "/settings/team" },
  {
    id: "billing",
    label: "Billing",
    href: "/settings/billing",
    disabled: true,
  },
  {
    id: "notifications",
    label: "Notifications",
    href: "/settings/notifications",
    disabled: true,
  },
];

export const SettingsSubNav = ({ active }: { active: SettingsSection }) => (
  <nav className="flex flex-wrap gap-3">
    {ITEMS.map((item) => {
      const isActive = item.id === active;
      const className = cn(
        "inline-flex h-7 items-center rounded-full border px-3 font-medium font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
        isActive
          ? "border-[#56C870] text-zinc-50"
          : "border-white/[0.06] text-zinc-500 hover:border-white/[0.16] hover:text-zinc-50",
        item.disabled && "pointer-events-none text-zinc-700"
      );
      return item.disabled ? (
        <span className={className} key={item.id}>
          {item.label}
        </span>
      ) : (
        <Link className={className} href={item.href} key={item.id}>
          {item.label}
        </Link>
      );
    })}
  </nav>
);
