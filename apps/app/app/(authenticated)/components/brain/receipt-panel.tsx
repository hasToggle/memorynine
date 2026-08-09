"use client";

import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import type { Receipt } from "@repo/knowledge";

// The receipt the marketing site promises, with the rows renamed to things we
// can actually prove. It stays open until another chip is clicked: this is a
// reading surface, not a tooltip.

// "checked" is the only tier a reader can treat as settled — the same rule
// the chip uses. Disputed facts, unreviewed sources, and reviewed-but-raw
// sources all get the amber caution treatment, because none of them license
// quoting this wording as a confirmed fact.
const isWarn = (receipt: Receipt) => receipt.tier !== "checked";

export const ReceiptPanel = ({
  receipt,
}: {
  receipt: Receipt | "loading" | undefined;
}) => {
  if (receipt === undefined) {
    return null;
  }

  if (receipt === "loading") {
    return (
      <div className="mt-3 rounded-lg border p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
      </div>
    );
  }

  const warn = isWarn(receipt);

  return (
    <aside
      className={cn(
        "mt-3 rounded-lg border border-t-2 bg-muted/30 p-4",
        warn ? "border-t-amber-500" : "border-t-primary"
      )}
    >
      <p className="font-medium font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
        {receipt.kind === "fact" ? "Receipt" : "Raw material"}
      </p>

      <dl className="mt-3">
        {receipt.rows.map((row) => (
          <div className="flex gap-3 py-1.5" key={row.label}>
            <dt className="w-[7.5rem] shrink-0 font-medium font-mono text-[0.6875rem] text-muted-foreground uppercase leading-[1.5] tracking-[0.05em]">
              {row.label}
            </dt>
            <dd className="text-[0.8125rem] leading-[1.5]">{row.detail}</dd>
          </div>
        ))}
      </dl>

      {receipt.quote ? (
        <blockquote
          className={cn(
            "mt-3 border-l-2 py-1 pl-3.5 text-[0.875rem] leading-[1.6]",
            warn ? "border-amber-500" : "border-primary"
          )}
        >
          {receipt.quote}
        </blockquote>
      ) : null}

      <p
        className={cn(
          "mt-3.5 font-medium font-mono text-[0.6875rem] leading-[1.5]",
          warn ? "text-amber-700 dark:text-amber-400" : "text-primary"
        )}
      >
        {receipt.verdict}
      </p>
    </aside>
  );
};
