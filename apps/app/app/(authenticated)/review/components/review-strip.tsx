import { cn } from "@repo/design-system/lib/utils";
import { MailIcon, MicIcon, PenLineIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import type { ProposalListItem } from "@/app/actions/knowledge/list-proposals";

// The queue as a filmstrip above the detail instead of a column beside it:
// position and jump-navigation in one glance-height row, while the proposal
// being reviewed — the actual work — keeps the full width. Skipped sources
// trail the open items after a divider, dimmed: recoverable, not work.

const SOURCE_ICONS = {
  email: MailIcon,
  manual: PenLineIcon,
  voice: MicIcon,
} as const;

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);

const sourceIcon = (sourceType: string | null) => {
  const Icon =
    (sourceType && SOURCE_ICONS[sourceType as keyof typeof SOURCE_ICONS]) ||
    SparklesIcon;
  return <Icon className="size-3.5 shrink-0" />;
};

// Consolidation and contradiction proposals carry no source; name the kind
// instead so the chip still says where the drafts came from.
const itemTitle = (item: ProposalListItem): string =>
  item.sourceType
    ? { email: "Email", manual: "Note", voice: "Voice memo" }[
        item.sourceType as "email" | "manual" | "voice"
      ]
    : item.kind;

const StripChip = ({
  active,
  item,
  skipped,
}: {
  active: boolean;
  item: ProposalListItem;
  skipped?: boolean;
}) => (
  <Link
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex shrink-0 snap-start flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors",
      active
        ? "border-primary/50 bg-muted"
        : "hover:border-border hover:bg-muted/50",
      active || "border-transparent",
      skipped && "border-dashed opacity-70 hover:opacity-100",
      skipped && !active && "border-border/60"
    )}
    href={`/review/${item.id}`}
  >
    <span className="flex items-center gap-1.5 font-medium text-sm">
      {sourceIcon(item.sourceType)}
      {itemTitle(item)}
    </span>
    <span className="text-muted-foreground text-xs tabular-nums">
      {formatTime(item.createdAt)}
      {skipped ? " · skipped" : ` · ${item.pendingCount} pending`}
    </span>
  </Link>
);

export const ReviewStrip = ({
  activeId,
  open,
  skipped,
}: {
  activeId?: string;
  open: ProposalListItem[];
  skipped: ProposalListItem[];
}) => {
  if (open.length === 0 && skipped.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label="Review queue"
      className="flex items-stretch gap-2 overflow-x-auto pb-1"
      style={{ scrollSnapType: "x proximity" }}
    >
      {open.map((item) => (
        <StripChip active={item.id === activeId} item={item} key={item.id} />
      ))}
      {skipped.length > 0 ? (
        <>
          <div aria-hidden className="my-1 w-px shrink-0 bg-border" />
          {skipped.map((item) => (
            <StripChip
              active={item.id === activeId}
              item={item}
              key={item.id}
              skipped
            />
          ))}
        </>
      ) : null}
    </nav>
  );
};
