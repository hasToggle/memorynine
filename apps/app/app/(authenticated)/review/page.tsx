import { auth } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import { CheckCircle2Icon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listOpenProposals,
  listSkippedProposals,
} from "@/app/actions/knowledge/list-proposals";
import { Header } from "../components/header";
import { Desk } from "./components/desk";

export const metadata: Metadata = {
  description: "Confirm, edit, or discard what extraction proposed.",
  title: "Review",
};

// Straight to work: with the queue rendered as a strip on every proposal
// page, this route only needs a body of its own when there is nothing to
// review. Otherwise the desk IS the first open proposal.

const ReviewPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/join");
  }
  const [open, skipped] = await Promise.all([
    listOpenProposals(),
    listSkippedProposals(),
  ]);
  const [first] = open;
  if (first) {
    redirect(`/review/${first.id}`);
  }

  return (
    <>
      <Header page="Review" pages={[{ href: "/", label: "Brain" }]} />
      <Desk open={open} skipped={skipped}>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <CheckCircle2Icon className="size-8 text-muted-foreground" />
          <p className="font-medium text-sm">All caught up</p>
          <p className="max-w-sm text-muted-foreground text-sm">
            Everything extraction proposed has been reviewed. New captures land
            here within seconds.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Ask the brain</Link>
          </Button>
        </div>
      </Desk>
    </>
  );
};

export default ReviewPage;
