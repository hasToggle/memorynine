import { auth } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listOpenProposals,
  listSkippedProposals,
} from "@/app/actions/knowledge/list-proposals";
import { Header } from "../components/header";

export const metadata: Metadata = {
  description: "Confirm, edit, or discard extracted knowledge.",
  title: "Review",
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

const ReviewPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }
  const [openProposals, skippedProposals] = await Promise.all([
    listOpenProposals(),
    listSkippedProposals(),
  ]);

  return (
    <>
      <Header page="Review" pages={["Knowledge"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {openProposals.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground text-sm">
            No open proposals — captured sources will show up here once
            extraction proposes knowledge. Sources that extraction found nothing
            in appear under Skipped, with the reason why.
          </div>
        ) : (
          openProposals.map((proposal) => (
            <Link href={`/review/${proposal.id}`} key={proposal.id}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Badge variant="outline">{proposal.kind}</Badge>
                    {proposal.sourceType ? (
                      <Badge variant="secondary">{proposal.sourceType}</Badge>
                    ) : null}
                    {proposal.rejectedCount > 0 ? (
                      <Badge variant="destructive">
                        {proposal.rejectedCount} rejected
                      </Badge>
                    ) : null}
                    <span className="font-normal text-muted-foreground text-sm">
                      {formatDate(proposal.createdAt)}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {proposal.entityDraftCount} entity draft
                    {proposal.entityDraftCount === 1 ? "" : "s"},{" "}
                    {proposal.factDraftCount} fact draft
                    {proposal.factDraftCount === 1 ? "" : "s"} —{" "}
                    {proposal.pendingCount} pending
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))
        )}
        {skippedProposals.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
              Skipped
            </h2>
            {skippedProposals.map((proposal) => (
              <Card className="border-dashed bg-muted/30" key={proposal.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Badge variant="outline">{proposal.kind}</Badge>
                    {proposal.sourceType ? (
                      <Badge variant="secondary">{proposal.sourceType}</Badge>
                    ) : null}
                    {proposal.rejectedCount > 0 ? (
                      <Badge variant="destructive">
                        {proposal.rejectedCount} rejected
                      </Badge>
                    ) : null}
                    <span className="font-normal text-xs">
                      {formatDate(proposal.createdAt)}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {proposal.skipReason ?? "No reason recorded."}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default ReviewPage;
