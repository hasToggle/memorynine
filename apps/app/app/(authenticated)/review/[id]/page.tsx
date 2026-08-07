import { auth } from "@repo/auth/server";
import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProposal } from "@/app/actions/knowledge/get-proposal";
import {
  listOpenProposals,
  listSkippedProposals,
} from "@/app/actions/knowledge/list-proposals";
import { Header } from "../../components/header";
import { Desk } from "../components/desk";
import { RejectedDrafts } from "../components/rejected-drafts";
import { SourceQuote } from "../components/source-quote";
import { ReExtractControl } from "./components/re-extract-control";
import { ReviewForm } from "./components/review-form";

export const metadata: Metadata = {
  description: "Confirm, edit, or discard extracted knowledge.",
  title: "Review proposal",
};

const ProposalPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }
  const { id } = await params;
  const [proposal, open, skipped] = await Promise.all([
    getProposal(id),
    listOpenProposals(),
    listSkippedProposals(),
  ]);
  if (!proposal) {
    notFound();
  }

  // Where the desk advances after this proposal resolves: the entry that
  // takes its place in the queue, or the top when it came from elsewhere
  // (a skipped entry, a stale link).
  const position = open.findIndex((item) => item.id === proposal.id);
  const remaining = open.filter((item) => item.id !== proposal.id);
  const nextTarget =
    remaining[position === -1 ? 0 : Math.min(position, remaining.length - 1)];

  return (
    <>
      <Header
        page="Proposal"
        pages={[
          { href: "/", label: "Brain" },
          { href: "/review", label: "Review" },
        ]}
      />
      <Desk
        activeId={proposal.id}
        mobileView="detail"
        open={open}
        skipped={skipped}
      >
        <Link
          className="flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground md:hidden"
          href="/review"
        >
          <ArrowLeftIcon className="size-4" />
          Review queue
        </Link>
        {proposal.source ? (
          <SourceQuote
            capturedBy={proposal.source.capturedBy}
            content={proposal.source.content}
            type={proposal.source.type}
          />
        ) : null}
        {proposal.skipReason ? (
          <ReExtractControl
            proposalId={proposal.id}
            skipReason={proposal.skipReason}
          />
        ) : (
          <ReviewForm
            nextHref={nextTarget ? `/review/${nextTarget.id}` : undefined}
            proposal={proposal}
          />
        )}
        {proposal.rejectedDrafts.length > 0 ? (
          <RejectedDrafts drafts={proposal.rejectedDrafts} />
        ) : null}
      </Desk>
    </>
  );
};

export default ProposalPage;
