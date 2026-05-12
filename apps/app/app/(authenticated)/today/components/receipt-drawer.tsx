"use client";

/**
 * Receipt Side Panel — slides in from the right edge when any receipt
 * pill is clicked anywhere in the app. Ported from Stitch screen
 * aa27a1434e6e4036a97ee8e8528fc47d (project 275623396639891029).
 *
 * Three vertical sections:
 *  1. Header — title with decimal desaturation + subtitle counting orders
 *     / refunds / fees.
 *  2. 7-day sparkline strip — 7 vertical bars (yesterday in accent green,
 *     others zinc-700), date labels beneath.
 *  3. Scrollable line-item list — timestamp / description / amount.
 *
 * Day-12 ships demo content; real wiring (fetch line items by snapshot id)
 * lands when /api/snapshots/<id>/line-items is exposed by apps/api.
 */

import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

interface LineItem {
  amount: string;
  description: string;
  /** When true (refunds/fees), render in zinc-400. Otherwise pure white. */
  outflow?: boolean;
  timestamp: string;
}

const DEMO_ITEMS: LineItem[] = [
  {
    timestamp: "11:58 PM",
    description: "Order #10432 — Bamboo Sheet Set",
    amount: "+$240.00",
  },
  {
    timestamp: "11:42 PM",
    description: "Order #10431 — Waffle Robe",
    amount: "+$125.00",
  },
  {
    timestamp: "11:30 PM",
    description: "Stripe processing fee",
    amount: "−$342.10",
    outflow: true,
  },
  {
    timestamp: "10:55 PM",
    description: "Refund #992 — Cotton Crew Tee · White",
    amount: "−$45.00",
    outflow: true,
  },
  {
    timestamp: "10:15 PM",
    description: "Order #10430 — Linen Lounge Set",
    amount: "+$184.50",
  },
  {
    timestamp: "09:42 PM",
    description: "Order #10429 — Linen Pant · Stone",
    amount: "+$110.00",
  },
  {
    timestamp: "08:20 PM",
    description: "Order #10428 — Sleep Tee · Bone",
    amount: "+$65.00",
  },
  {
    timestamp: "07:12 PM",
    description: "Order #10427 — Wool Throw",
    amount: "+$195.00",
  },
  {
    timestamp: "06:05 PM",
    description: "Refund #991 — Linen Lounge Set",
    amount: "−$184.50",
    outflow: true,
  },
  {
    timestamp: "05:30 PM",
    description: "Order #10426 — Bamboo Sheet Set",
    amount: "+$480.00",
  },
  {
    timestamp: "04:15 PM",
    description: "Order #10425 — Cotton Crew Tee · Black",
    amount: "+$45.00",
  },
  {
    timestamp: "03:40 PM",
    description: "Order #10424 — Cashmere Beanie x4",
    amount: "+$1,200.00",
  },
  {
    timestamp: "02:10 PM",
    description: "Order #10423 — Waffle Robe",
    amount: "+$125.00",
  },
  {
    timestamp: "01:05 PM",
    description: "Order #10422 — Linen Lounge Set",
    amount: "+$184.50",
  },
];

// 7 heights for the sparkline bars (last is "yesterday" — full height + accent).
const SPARK_HEIGHTS = [40, 55, 45, 70, 65, 85, 100];
const SPARK_LABELS = [
  "May 01",
  "May 02",
  "May 03",
  "May 04",
  "May 05",
  "May 06",
  "YESTERDAY",
];

export interface ReceiptDrawerProps {
  items?: LineItem[];
  onClose: () => void;
  open: boolean;
  subtitle?: string;
  title?: string;
}

export const ReceiptDrawer = ({
  open,
  onClose,
  title = "$42,873.20",
  subtitle = "342 orders · 4 refunds · $1,247 in fees",
  items = DEMO_ITEMS,
}: ReceiptDrawerProps) => {
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape. Simple modal-style focus management.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  // Apply decimal desaturation to the title. Splits on the last "."
  // so "$42,873.20" → dollars `$42,873`, cents `.20`.
  const lastDot = title.lastIndexOf(".");
  const dollars = lastDot === -1 ? title : title.slice(0, lastDot);
  const cents = lastDot === -1 ? "" : title.slice(lastDot);

  return (
    <>
      {/* Scrim — dims the page behind the drawer to 50% as the Stitch
          design specifies. Click to close. */}
      <button
        aria-label="Close receipt"
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
        type="button"
      />

      {/* Drawer */}
      <aside
        aria-label="Receipt details"
        className="fixed top-0 right-0 z-50 flex h-full w-[440px] flex-col border-white/[0.06] border-l bg-[#0E0E11]"
        ref={ref}
        role="dialog"
      >
        {/* Header */}
        <header className="flex items-start justify-between border-white/[0.06] border-b px-6 py-5">
          <div>
            <h2 className="font-light text-[18px] text-zinc-50 tabular-nums">
              <span className="text-white">{dollars}</span>
              <span className="text-[#71717A]">{cents}</span>
              <span className="mx-2 text-zinc-500">—</span>
              <span className="text-[14px] text-zinc-400">
                yesterday&apos;s net revenue
              </span>
            </h2>
            <p className="mt-1 text-[13px] text-zinc-400">{subtitle}</p>
          </div>
          <button
            aria-label="Close"
            className="text-zinc-500 transition-colors hover:text-zinc-100"
            onClick={onClose}
            type="button"
          >
            <XIcon className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </header>

        {/* Sparkline strip */}
        <section className="border-white/[0.06] border-b px-6 py-6">
          <div className="mb-2 flex h-[64px] items-end justify-between gap-2 px-1">
            {SPARK_HEIGHTS.map((h, i) => (
              <div
                className={`w-[3px] rounded-t-sm ${
                  i === SPARK_HEIGHTS.length - 1
                    ? "bg-[#56C870]"
                    : "bg-zinc-700"
                }`}
                key={SPARK_LABELS[i]}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between px-1">
            {SPARK_LABELS.map((label, i) => (
              <span
                className={`font-mono text-[8px] uppercase tracking-wider ${
                  i === SPARK_LABELS.length - 1
                    ? "font-medium text-zinc-400"
                    : "text-zinc-600"
                }`}
                key={label}
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* Line-item list */}
        <section className="flex-1 overflow-y-auto">
          <div className="divide-y divide-white/[0.04]">
            {items.map((item) => (
              <div
                className="flex h-[56px] items-center gap-4 px-6 transition-colors hover:bg-white/[0.02]"
                key={`${item.timestamp}-${item.description}`}
              >
                <span className="w-[80px] shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums">
                  {item.timestamp}
                </span>
                <span className="flex-1 truncate text-[13px] text-zinc-200">
                  {item.description}
                </span>
                <span
                  className={`shrink-0 font-medium font-mono text-[13px] tabular-nums ${
                    item.outflow ? "text-zinc-400" : "text-white"
                  }`}
                >
                  {item.amount}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Footer hint */}
        <footer className="border-white/[0.06] border-t px-6 py-3">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">
            Verified against Stripe &amp; Shopify · ESC to close
          </p>
        </footer>
      </aside>
    </>
  );
};
