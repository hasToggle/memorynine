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
import { listOpenProposals } from "@/app/actions/knowledge/list-proposals";
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
  const proposals = await listOpenProposals();

  return (
    <>
      <Header page="Review" pages={["Knowledge"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {proposals.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground text-sm">
            No open proposals — captured sources will show up here once
            extraction proposes knowledge.
          </div>
        ) : (
          proposals.map((proposal) => (
            <Link href={`/review/${proposal.id}`} key={proposal.id}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Badge variant="outline">{proposal.kind}</Badge>
                    {proposal.sourceType ? (
                      <Badge variant="secondary">{proposal.sourceType}</Badge>
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
      </div>
    </>
  );
};

export default ReviewPage;
