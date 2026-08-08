import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import { Toolbar } from "@repo/feature-flags/components/toolbar";
import type { ReactNode } from "react";

interface RootLayoutProperties {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProperties) => (
  // `scroll-smooth` is here for the landing page's section links and the anchors
  // in the legal pages' table of contents. Next 16 stopped overriding
  // scroll-behavior during route transitions by default, so without the data
  // attribute a navigation from halfway down one page animates its way to the
  // top of the next one. The attribute opts back into the override: instant for
  // route changes, smooth for the in-page jumps we actually wanted it for.
  <html
    className={cn(fonts, "scroll-smooth")}
    data-scroll-behavior="smooth"
    lang="en"
    suppressHydrationWarning
  >
    <body>
      <AnalyticsProvider>
        <DesignSystemProvider>{children}</DesignSystemProvider>
      </AnalyticsProvider>
      <Toolbar />
    </body>
  </html>
);

export default RootLayout;
