/** Tiny formatting helpers shared by the three renderers. */

export const formatPct = (n: number): string =>
  `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export const trendArrow = (trend: "up" | "down" | "flat"): string => {
  if (trend === "up") {
    return "▲";
  }
  if (trend === "down") {
    return "▼";
  }
  return "→";
};

export const severityEmoji = (sev: "low" | "medium" | "high"): string => {
  if (sev === "high") {
    return "🔴";
  }
  if (sev === "medium") {
    return "🟡";
  }
  return "⚪️";
};

export const severityColor = (sev: "low" | "medium" | "high"): string => {
  if (sev === "high") {
    return "#b91c1c";
  }
  if (sev === "medium") {
    return "#b45309";
  }
  return "#666";
};
