import type { ReactNode } from "react";

interface LocaleLayoutProperties {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
}

const LocaleLayout = ({ children }: LocaleLayoutProperties) => (
  <div className="font-switzer selection:bg-mn-stamp/15">
    <link
      href="https://api.fontshare.com/css?f%5B%5D=switzer@400,500,600,700&f%5B%5D=cabinet-grotesk@500,700,800&display=swap"
      rel="stylesheet"
    />
    <link
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    {children}
  </div>
);

export default LocaleLayout;
