import { Badge } from "@repo/design-system/components/ui/badge";
import Link from "next/link";
import type { ProposalListItem } from "@/app/actions/knowledge/list-proposals";

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

const ProposalBadges = ({ proposal }: { proposal: ProposalListItem }) => (
  <>
    <Badge variant="outline">{proposal.kind}</Badge>
    {proposal.sourceType ? (
      <Badge variant="secondary">{proposal.sourceType}</Badge>
    ) : null}
    {proposal.rejectedCount > 0 ? (
      <Badge variant="destructive">{proposal.rejectedCount} rejected</Badge>
    ) : null}
  </>
);

export const ReviewPane = ({
  open,
  skipped,
}: {
  open: ProposalListItem[];
  skipped: ProposalListItem[];
}) => (
  <div className="flex flex-col gap-6">
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-sm">Waiting for review</h2>
        <p className="text-muted-foreground text-xs">
          Confirm, edit, or discard what extraction proposed. Nothing becomes
          knowledge without your sign-off.
        </p>
      </div>
      {open.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
          Nothing waiting — captured sources show up here once extraction
          proposes knowledge.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {open.map((proposal) => (
            <Link
              className="flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              href={`/review/${proposal.id}`}
              key={proposal.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ProposalBadges proposal={proposal} />
                <span className="ml-auto text-muted-foreground text-xs">
                  {formatDate(proposal.createdAt)}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {proposal.entityDraftCount} entity draft
                {proposal.entityDraftCount === 1 ? "" : "s"},{" "}
                {proposal.factDraftCount} fact draft
                {proposal.factDraftCount === 1 ? "" : "s"} —{" "}
                {proposal.pendingCount} pending
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
    {skipped.length > 0 ? (
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-sm">Skipped</h2>
          <p className="text-muted-foreground text-xs">
            Sources extraction found nothing in, with the reason why. Re-run
            them with a hint if it missed something.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {skipped.map((proposal) => (
            <Link
              className="flex flex-col gap-1 rounded-lg border border-dashed bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              href={`/review/${proposal.id}`}
              key={proposal.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ProposalBadges proposal={proposal} />
                <span className="ml-auto text-muted-foreground text-xs">
                  {formatDate(proposal.createdAt)}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {proposal.skipReason ?? "No reason recorded."}
              </p>
            </Link>
          ))}
        </div>
      </section>
    ) : null}
  </div>
);
