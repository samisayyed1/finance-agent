"use client";

import type { ReconciliationFlag } from "@ai-cfo/database";
import { Badge } from "@ai-cfo/design-system/components/ui/badge";
import { Button } from "@ai-cfo/design-system/components/ui/button";
import { Checkbox } from "@ai-cfo/design-system/components/ui/checkbox";
import { useState, useTransition } from "react";
import { bulkUpdateFlags, type FlagBulkAction } from "../actions";

interface FlagListProps {
  flags: ReconciliationFlag[];
}

const statusVariant = (
  status: string
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "resolved") {
    return "default";
  }
  if (status === "dismissed") {
    return "secondary";
  }
  if (status === "snoozed" || status === "investigating") {
    return "outline";
  }
  return "destructive"; // open
};

const renderNarrative = (flag: ReconciliationFlag): string => {
  if (flag.kind === "ATTRIBUTION_MISMATCH") {
    return `${flag.flagId.startsWith("ATTR_meta") ? "Meta" : "Google"} reported ${flag.expected} conversions; Shopify attributed ${flag.actual} (drift ${flag.delta}).`;
  }
  if (flag.kind === "ORDER_MISSING_PAYMENT") {
    return `Order ${flag.orderId} for ${flag.expected} has no matching Stripe payment.`;
  }
  if (flag.kind === "PAYMENT_WITHOUT_ORDER") {
    return `Stripe payment ${flag.paymentId} (${flag.actual}) doesn't link to a Shopify order.`;
  }
  if (flag.kind === "FEE_DRIFT") {
    return `Order ${flag.orderId} expected ${flag.expected}; gross+fee on payment ${flag.paymentId} = ${flag.actual} (drift ${flag.delta}).`;
  }
  return `${flag.kind}: expected ${flag.expected}, actual ${flag.actual}.`;
};

export const FlagList = ({ flags }: FlagListProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const toggle = (flagId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(flagId)) {
        next.delete(flagId);
      } else {
        next.add(flagId);
      }
      return next;
    });

  const runBulk = (action: FlagBulkAction) => {
    if (selected.size === 0) {
      return;
    }
    const ids = [...selected];
    startTransition(async () => {
      await bulkUpdateFlags({ flagIds: ids, action });
      setSelected(new Set());
      // Server component re-renders on next navigation; quickest path is
      // a page reload. Day-7 will use revalidatePath() from the action.
      window.location.reload();
    });
  };

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="sticky top-0 flex items-center gap-2 rounded-md border bg-muted/50 p-2">
          <span className="font-medium text-sm">{selected.size} selected</span>
          <Button
            disabled={pending}
            onClick={() => runBulk("resolve")}
            size="sm"
            variant="default"
          >
            Resolve
          </Button>
          <Button
            disabled={pending}
            onClick={() => runBulk("dismiss")}
            size="sm"
            variant="secondary"
          >
            Dismiss
          </Button>
          <Button
            disabled={pending}
            onClick={() => runBulk("snooze")}
            size="sm"
            variant="outline"
          >
            Snooze 7d
          </Button>
          <Button
            disabled={pending}
            onClick={() => runBulk("investigate")}
            size="sm"
            variant="outline"
          >
            Investigate
          </Button>
        </div>
      ) : null}
      {flags.map((flag) => (
        <div
          className="flex items-start gap-3 rounded-md border p-3"
          key={flag.flagId}
        >
          <Checkbox
            checked={selected.has(flag.flagId)}
            onCheckedChange={() => toggle(flag.flagId)}
          />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{flag.kind}</Badge>
              <Badge variant={statusVariant(flag.status)}>{flag.status}</Badge>
              <span className="text-muted-foreground text-xs">
                {flag.createdAt.toISOString().slice(0, 10)}
              </span>
            </div>
            <p className="text-sm">{renderNarrative(flag)}</p>
            <p className="font-mono text-muted-foreground text-xs">
              {flag.flagId}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
