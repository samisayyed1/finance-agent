import "./styles.css";
import { AnalyticsProvider } from "@ai-cfo/analytics/provider";
import { DesignSystemProvider } from "@ai-cfo/design-system";
import { fonts } from "@ai-cfo/design-system/lib/fonts";
import { cn } from "@ai-cfo/design-system/lib/utils";
import { Toolbar } from "@ai-cfo/feature-flags/components/toolbar";
import { getDictionary } from "@ai-cfo/internationalization";
import type { ReactNode } from "react";
import { Footer } from "./components/footer";
import { Header } from "./components/header";

interface RootLayoutProperties {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
}

const RootLayout = async ({ children, params }: RootLayoutProperties) => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <AnalyticsProvider>
          <DesignSystemProvider>
            <Header dictionary={dictionary} />
            {children}
            <Footer />
          </DesignSystemProvider>
          <Toolbar />
        </AnalyticsProvider>
      </body>
    </html>
  );
};

export default RootLayout;
