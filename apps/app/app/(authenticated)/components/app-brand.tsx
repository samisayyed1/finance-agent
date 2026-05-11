"use client";

/**
 * Product wordmark shown above the org switcher in the sidebar. Collapses
 * to a compact glyph when the sidebar is in icon mode (Radix Sidebar
 * exposes the state via `data-state="collapsed"` on the parent).
 *
 * Tailwind-only; no SVG asset. Keeps the bundle small and the wordmark
 * adjustable from a single component.
 */

import { useSidebar } from "@ai-cfo/design-system/components/ui/sidebar";

export const AppBrand = () => {
  const sidebar = useSidebar();
  const collapsed = sidebar.state === "collapsed";

  if (collapsed) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background font-mono font-semibold text-foreground text-xs tracking-tight">
        ai
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 pt-1 pb-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md border bg-background font-mono font-semibold text-foreground text-xs tracking-tight">
        ai
      </div>
      <div className="leading-tight">
        <p className="font-semibold text-sm tracking-tight">AI · CFO</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Operating
        </p>
      </div>
    </div>
  );
};
