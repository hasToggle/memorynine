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
      </div>
    </>
  );
};

export default ProposalPage;
