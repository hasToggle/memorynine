"use client";

import { Menu } from "lucide-react";
import { useCallback, useState } from "react";
import { Logo } from "./logo";
import { Link } from "./marketing-link";
import { PlusGrid, PlusGridItem, PlusGridRow } from "./plus-grid";

const links: { href: string; label: string }[] = [];

function DesktopNav({ variant }: { variant: "light" | "dark" }) {
  return (
    <nav className="relative hidden lg:flex">
      {links.map(({ href, label }) => (
        <PlusGridItem className="relative flex" key={href} variant={variant}>
          <Link
            className={`flex items-center px-4 py-3 font-medium text-base ${variant === "dark" ? "text-white" : "text-foreground"} bg-blend-multiply hover:bg-black/2.5`}
            href={href}
          >
            {label}
          </Link>
        </PlusGridItem>
      ))}
    </nav>
  );
}

function MobileNavButton({
  variant,
  onClick,
}: {
  variant: "light" | "dark";
  onClick: () => void;
}) {
  return (
    <button
      aria-label="Open main menu"
      className="flex size-12 items-center justify-center self-center rounded-lg hover:bg-black/5 lg:hidden"
      onClick={onClick}
      type="button"
    >
      <Menu
        className={`size-6 ${variant === "dark" ? "text-white" : "text-foreground"}`}
      />
    </button>
  );
}

function MobileNav({
  variant,
  open,
}: {
  variant: "light" | "dark";
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="lg:hidden">
      <div className="flex flex-col gap-6 py-4">
        {links.map(({ href, label }) => (
          <div key={href}>
            <Link
              className={`font-medium text-base ${variant === "dark" ? "text-white" : "text-foreground"}`}
              href={href}
            >
              {label}
            </Link>
          </div>
        ))}
      </div>
      <div className="absolute left-1/2 w-screen -translate-x-1/2">
        <div
          className={`absolute inset-x-0 top-0 border-t ${variant === "dark" ? "border-white/10" : "border-black/5"}`}
        />
        <div
          className={`absolute inset-x-0 top-2 border-t ${variant === "dark" ? "border-white/10" : "border-black/5"}`}
        />
      </div>
    </div>
  );
}

export function Navbar({
  banner,
  variant = "light",
}: {
  banner?: React.ReactNode;
  variant?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const toggleMobileNav = useCallback(() => setOpen((current) => !current), []);

  return (
    <header className="pt-12 sm:pt-16">
      <PlusGrid>
        <PlusGridRow
          className="relative flex justify-between"
          variant={variant}
        >
          <div className="relative flex gap-6">
            <PlusGridItem className="py-3" variant={variant}>
              <Link href="/" title="Home">
                <Logo
                  className="inline-block h-6"
                  fill={variant === "dark" ? "white" : "var(--foreground)"}
                />
              </Link>
            </PlusGridItem>
            {banner ? (
              <div className="relative hidden items-center py-3 lg:flex">
                {banner}
              </div>
            ) : null}
          </div>
          <DesktopNav variant={variant} />
          <MobileNavButton onClick={toggleMobileNav} variant={variant} />
        </PlusGridRow>
      </PlusGrid>
      <MobileNav open={open} variant={variant} />
    </header>
  );
}
