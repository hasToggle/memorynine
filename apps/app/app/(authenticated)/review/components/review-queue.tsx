import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { MailIcon, MicIcon, PenLineIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import type { ProposalListItem } from "@/app/actions/knowledge/list-proposals";

// One entry per proposal, newest first — the persistent "what's waiting"
// column of the desk. Skipped sources sit below the open queue, subdued:
// they are recoverable (re-extract), not work.

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
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
};

// Consolidation and contradiction proposals carry no source; name the kind
// instead so the entry still says where the drafts came from.
const itemTitle = (item: ProposalListItem): string =>
  item.sourceType
    ? { email: "Email", manual: "Note", voice: "Voice memo" }[
        item.sourceType as "email" | "manual" | "voice"
      ]
    : item.kind;

const QueueEntry = ({
  active,
  item,
}: {
  active: boolean;
  item: ProposalListItem;
}) => (
  <Link
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex flex-col gap-1 rounded-lg border p-3 transition-colors",
      active
        ? "border-primary/40 bg-muted"
        : "border-transparent hover:bg-muted/50"
    )}
    href={`/review/${item.id}`}
  >
    <div className="flex items-center gap-2">
      {sourceIcon(item.sourceType)}
      <span className="font-medium text-sm">{itemTitle(item)}</span>
      <span className="ml-auto text-muted-foreground text-xs tabular-nums">
        {formatTime(item.createdAt)}
      </span>
    </div>
    {item.skipReason ? (
      <p className="line-clamp-2 text-muted-foreground text-xs">
        {item.skipReason}
      </p>
    ) : (
      <p className="text-muted-foreground text-xs">
        {item.pendingCount} of {item.entityDraftCount + item.factDraftCount}{" "}
        drafts pending
        {item.rejectedCount > 0 ? ` · ${item.rejectedCount} rejected` : ""}
      </p>
    )}
  </Link>
);

export const ReviewQueue = ({
  activeId,
  open,
  skipped,
}: {
  activeId?: string;
  open: ProposalListItem[];
  skipped: ProposalListItem[];
}) => (
  <nav aria-label="Review queue" className="flex flex-col gap-5">
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Waiting for review
        </h2>
        {open.length > 0 ? (
          <Badge className="rounded-full" variant="secondary">
            {open.length}
          </Badge>
        ) : null}
      </div>
      {open.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
          Nothing waiting. Captured sources show up here as soon as extraction
          proposes knowledge.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {open.map((item) => (
            <QueueEntry
              active={item.id === activeId}
              item={item}
              key={item.id}
            />
          ))}
        </div>
      )}
    </section>
    {skipped.length > 0 ? (
      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Skipped sources
        </h2>
        <div className="flex flex-col gap-1 opacity-80">
          {skipped.map((item) => (
            <QueueEntry
              active={item.id === activeId}
              item={item}
              key={item.id}
            />
          ))}
        </div>
      </section>
    ) : null}
  </nav>
);
