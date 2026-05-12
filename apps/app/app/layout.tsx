import { env } from "@/env";
import "./styles.css";
import { AnalyticsProvider } from "@ai-cfo/analytics/provider";
import { DesignSystemProvider } from "@ai-cfo/design-system";
import { fonts } from "@ai-cfo/design-system/lib/fonts";
import { Toolbar } from "@ai-cfo/feature-flags/components/toolbar";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  // Page-level `metadata.title` strings render as
  // `<page-title> — AI Operating CFO`. Pages that omit a title fall back
  // to `default`.
  title: {
    default: "AI Operating CFO",
    template: "%s — AI Operating CFO",
  },
  description:
    "Your operator-grade daily snapshot. Cent-exact metrics, grounded narrative, recommendations you approve.",
};

interface RootLayoutProperties {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProperties) => (
  // Day-11 Cockpit: dark mode is the product. The `dark` class on <html>
  // turns on Tailwind's dark-mode tokens globally; light mode is a
  // toggle-target for Day-N+ but not the design default.
  <html className={`${fonts} dark`} lang="en" suppressHydrationWarning>
    <body className="bg-[#131316]">
      <AnalyticsProvider>
        <DesignSystemProvider
          helpUrl={env.NEXT_PUBLIC_DOCS_URL}
          privacyUrl={new URL(
            "/legal/privacy",
            env.NEXT_PUBLIC_WEB_URL
          ).toString()}
          termsUrl={new URL("/legal/terms", env.NEXT_PUBLIC_WEB_URL).toString()}
        >
          {children}
        </DesignSystemProvider>
      </AnalyticsProvider>
      <Toolbar />
    </body>
  </html>
);

export default RootLayout;
