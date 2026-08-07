import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import type { ProposalListItem } from "@/app/actions/knowledge/list-proposals";
import { ReviewQueue } from "./review-queue";

// The review desk's frame: the queue stays on screen while a proposal is
// worked, so "where am I, what's next" never needs a breadcrumb to answer.
// On small screens the two panes become two screens: /review is the queue,
// /review/[id] the detail (with a back link rendered by the page).

export const Desk = ({
  activeId,
  children,
  mobileView,
  open,
  skipped,
}: {
  activeId?: string;
  children: ReactNode;
  /** Which pane a phone-sized viewport shows; md+ always shows both. */
  mobileView: "detail" | "queue";
  open: ProposalListItem[];
  skipped: ProposalListItem[];
}) => (
  <div className="flex flex-1 gap-6 p-4 pt-0">
    <aside
      className={cn(
        "w-72 shrink-0",
        mobileView === "queue" ? "block w-full md:w-72" : "hidden md:block"
      )}
    >
      <div className="sticky top-4 max-h-[calc(100svh-5rem)] overflow-y-auto pr-1">
        <ReviewQueue activeId={activeId} open={open} skipped={skipped} />
      </div>
    </aside>
    <main
      className={cn(
        "min-w-0 flex-1",
        mobileView === "detail" ? "block" : "hidden md:block"
      )}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4">{children}</div>
    </main>
  </div>
);
