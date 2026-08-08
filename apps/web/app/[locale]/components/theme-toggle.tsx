"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";

/**
 * The landing page's own toggle rather than the design system's, which is a
 * three-item dropdown built from app tokens and would land in this palette as a
 * foreign object.
 *
 * Which icon shows is decided in CSS, from the `dark` class next-themes sets
 * before first paint — so there is no mounted flag, no flash, and no hydration
 * mismatch. The label describes what the button does rather than what the theme
 * currently is, which keeps it true at every point in that sequence.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = useCallback(
    () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    [resolvedTheme, setTheme]
  );

  return (
    <button
      aria-label="Switch between light and dark"
      className="-mr-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] text-mn-ink-soft transition-colors hover:bg-mn-rule/50 hover:text-mn-ink focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
      onClick={toggle}
      type="button"
    >
      <SunIcon className="size-[1.05rem] dark:hidden" />
      <MoonIcon className="hidden size-[1.05rem] dark:block" />
    </button>
  );
}
