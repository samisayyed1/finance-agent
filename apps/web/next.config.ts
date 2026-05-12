import { withToolbar } from "@ai-cfo/feature-flags/lib/toolbar";
import { config, withAnalyzer } from "@ai-cfo/next-config";
import { withLogging, withSentry } from "@ai-cfo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

// AI-CFO marketing site. Day 10 strip: removed the next-forge BaseHub CMS
// integration (`withCMS`) — we don't ship a blog yet, and the dep blocks
// `bun run build` without a live BaseHub token. Day-N+: if we want a
// content surface later, reintroduce CMS as an isolated /blog subroute
// rather than wrapping the entire Next config.

let nextConfig: NextConfig = withToolbar(withLogging(config));

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

export default nextConfig;
