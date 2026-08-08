import { cn } from "@repo/design-system/lib/utils";

interface FieldNoteProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Omit when the aside describes a standing practice rather than something
   * observed on a date — a date implies the claim could go stale.
   */
  date?: string;
  /**
   * Defaults to "field note", which claims the passage is Eric's own dated
   * observation. Override it when the aside carries something else.
   *
   * Name the subject rather than the kind of source. "from the literature"
   * and "the record" were both tried and both failed — the first overclaimed
   * for a passage that mixes a cited result with a teaching illustration, and
   * the second was so vague it had to be explained. A subject reads on a
   * projector without a footnote.
   */
  label?: string;
}

export function FieldNote({
  children,
  className,
  date,
  label = "field note",
}: FieldNoteProps) {
  // One expression, not `{label} · {date}`: JSX would leave the separator
  // and its spaces behind when the date is absent.
  const attribution = date ? `${label} · ${date}` : label;

  return (
    <aside
      className={cn(
        "mt-8 max-w-2xl border-ht-cyan-700/30 border-l-2 pl-4 dark:border-ht-cyan-500/40",
        className
      )}
    >
      <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
        {attribution}
      </p>
      <div className="mt-2 font-mono text-foreground/70 text-sm/6">
        {children}
      </div>
    </aside>
  );
}
