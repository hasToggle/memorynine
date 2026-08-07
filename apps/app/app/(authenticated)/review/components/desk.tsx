import type { ReactNode } from "react";
import type { ProposalListItem } from "@/app/actions/knowledge/list-proposals";
import { ReviewStrip } from "./review-strip";

// The review desk's frame: the queue is a filmstrip on top — "where am I,
// what's next" in one glance-height row on every screen size — and the
// proposal being worked gets the full width below it. No side column: with
// two or three items in the queue, a column is mostly dead space that taxes
// the detail, which is the actual work.

export const Desk = ({
  activeId,
  children,
  open,
  skipped,
}: {
  activeId?: string;
  children: ReactNode;
  open: ProposalListItem[];
  skipped: ProposalListItem[];
}) => (
  <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
    <div className="mx-auto w-full max-w-3xl">
      <ReviewStrip activeId={activeId} open={open} skipped={skipped} />
    </div>
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {children}
    </main>
  </div>
);
