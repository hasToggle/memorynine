import { auth } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProposal } from "@/app/actions/knowledge/get-proposal";
import { Header } from "../../components/header";
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
  const proposal = await getProposal(id);
  if (!proposal) {
    notFound();
  }

  return (
    <>
      <Header page="Proposal" pages={["Knowledge", "Review"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {proposal.source ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Source
                <Badge variant="secondary">{proposal.source.type}</Badge>
                <span className="font-normal text-muted-foreground text-sm">
                  captured by {proposal.source.capturedBy}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {proposal.source.content}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {proposal.skipReason ? (
          <ReExtractControl
            proposalId={proposal.id}
            skipReason={proposal.skipReason}
          />
        ) : (
          <ReviewForm proposal={proposal} />
        )}
        {proposal.rejectedDrafts.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Rejected drafts
                <Badge variant="destructive">
                  {proposal.rejectedDrafts.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {proposal.rejectedDrafts.map((draft, index) => (
                <div
                  className="flex flex-col gap-1"
                  // biome-ignore lint/suspicious/noArrayIndexKey: rejected drafts carry no id — the list is a fixed, never-reordered snapshot from the proposal document
                  key={index}
                >
                  <p className="text-sm">{draft.reason}</p>
                  <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 text-muted-foreground text-xs">
                    {JSON.stringify(draft.raw, null, 2)}
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
};

export default ProposalPage;
