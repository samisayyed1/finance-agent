"use client";

/**
 * Day-7 operator-dashboard sidebar.
 *
 * 7 nav items in two groups (Workspace, Settings). Alert badges are
 * passed in from the layout (server-resolved counts of open
 * `connection_alerts` and open/investigating `reconciliation_flags`),
 * so this client component never has to import server-only modules.
 *
 * Active highlighting derives from `usePathname()`. Root `/` is treated
 * as the Today route — exact-match only — so `/metrics` doesn't bleed
 * the highlight onto Today.
 */

import { OrganizationSwitcher } from "@ai-cfo/auth/client";
import { ModeToggle } from "@ai-cfo/design-system/components/mode-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ai-cfo/design-system/components/ui/sidebar";
import { cn } from "@ai-cfo/design-system/lib/utils";
import {
  DownloadIcon,
  HomeIcon,
  ListChecksIcon,
  MessageSquareIcon,
  PlugIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { AppBrand } from "./app-brand";

export interface SidebarAlertCounts {
  /** Number of unresolved `connection_alerts` rows (red dot if > 0). */
  readonly connections: number;
  /** Number of `reconciliation_flags` in `open` or `investigating` (yellow if > 0). */
  readonly reconciliation: number;
}

interface GlobalSidebarProperties {
  readonly alertCounts?: SidebarAlertCounts;
  readonly children: ReactNode;
}

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly badgeKey?: keyof SidebarAlertCounts;
  readonly badgeTone?: "red" | "yellow";
  readonly icon: IconType;
  readonly title: string;
  readonly url: string;
}

const WORKSPACE_ITEMS: readonly NavItem[] = [
  { title: "Today", url: "/", icon: HomeIcon },
  { title: "Metrics", url: "/metrics", icon: TrendingUpIcon },
  { title: "Analyst", url: "/analyst", icon: MessageSquareIcon },
  { title: "Exports", url: "/exports", icon: DownloadIcon },
];

const SETTINGS_ITEMS: readonly NavItem[] = [
  {
    title: "Connections",
    url: "/settings/connections",
    icon: PlugIcon,
    badgeKey: "connections",
    badgeTone: "red",
  },
  {
    title: "Reconciliation",
    url: "/settings/reconciliation",
    icon: ListChecksIcon,
    badgeKey: "reconciliation",
    badgeTone: "yellow",
  },
  { title: "Team", url: "/settings/team", icon: UsersIcon },
];

const isActiveRoute = (pathname: string, url: string): boolean => {
  if (url === "/") {
    return pathname === "/" || pathname === "/today";
  }
  return pathname === url || pathname.startsWith(`${url}/`);
};

const badgeClass = (tone: "red" | "yellow"): string =>
  tone === "red"
    ? "bg-red-500/15 text-red-600 dark:text-red-400"
    : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";

const renderItem = (
  item: NavItem,
  pathname: string,
  alertCounts: SidebarAlertCounts | undefined
): ReactNode => {
  const Icon = item.icon;
  const active = isActiveRoute(pathname, item.url);
  const count = item.badgeKey && alertCounts ? alertCounts[item.badgeKey] : 0;
  const showBadge = count > 0 && item.badgeTone;
  return (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
        <Link href={item.url}>
          <Icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
      {showBadge && item.badgeTone ? (
        <SidebarMenuBadge className={cn(badgeClass(item.badgeTone))}>
          {count > 99 ? "99+" : count}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
};

export const GlobalSidebar = ({
  alertCounts,
  children,
}: GlobalSidebarProperties) => {
  const pathname = usePathname();

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <AppBrand />
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {WORKSPACE_ITEMS.map((item) =>
                  renderItem(item, pathname, alertCounts)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SETTINGS_ITEMS.map((item) =>
                  renderItem(item, pathname, alertCounts)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <ModeToggle />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </>
  );
};
