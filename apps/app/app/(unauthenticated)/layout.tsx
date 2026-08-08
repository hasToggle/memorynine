import { Lockup } from "@repo/design-system/brand/logo";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="grid min-h-dvh lg:grid-cols-2">
    {/* The side panel is decoration on a small screen, so it is not there —
        the brand moves above the form instead of being lost. */}
    <aside className="relative hidden flex-col justify-between border-border border-r bg-muted p-10 lg:flex">
      <Lockup className="h-7 text-foreground" />
      <div className="max-w-sm">
        <p className="font-semibold text-foreground text-lg">
          Ninety seconds is enough to start.
        </p>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
          Record a memo about a call you had today, spend a minute confirming
          what it finds, and ask it something before your next call with them.
        </p>
      </div>
    </aside>

    <main className="relative flex flex-col items-center justify-center p-6 lg:p-8">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <Lockup className="mb-10 h-6 text-foreground lg:hidden" />
      {children}
    </main>
  </div>
);

export default AuthLayout;
