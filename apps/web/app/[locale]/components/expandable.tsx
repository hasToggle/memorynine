"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useState } from "react";

interface ExpandableProps {
  children: React.ReactNode;
  className?: string;
  label: string;
}

export function Expandable({ children, className, label }: ExpandableProps) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  return (
    <div className={cn("mt-6", className)}>
      <button
        className="group flex items-center gap-2 font-medium text-foreground text-sm hover:text-muted-foreground"
        onClick={toggle}
        type="button"
      >
        <span
          className={cn(
            "inline-block transition-transform duration-200",
            open && "rotate-90"
          )}
        >
          &#9656;
        </span>
        {label}
      </button>
      {open ? (
        <div className="mt-4 text-muted-foreground text-sm/6">{children}</div>
      ) : null}
    </div>
  );
}
