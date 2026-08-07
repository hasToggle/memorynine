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

// The desk's landing view: the queue, plus an invitation into the first
// proposal rather than an auto-redirect — on a phone this page IS the queue,
// and a redirect would make it unreachable from a proposal's back link.

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

  return (
    <>
      <Header page="Review" pages={[{ href: "/", label: "Brain" }]} />
      <Desk mobileView="queue" open={open} skipped={skipped}>
        {first ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="font-medium text-sm">
              {open.length} proposal{open.length === 1 ? "" : "s"} waiting
            </p>
            <p className="max-w-sm text-muted-foreground text-sm">
              Work the queue top to bottom — the desk moves to the next proposal
              after each one you resolve.
            </p>
            <Button asChild>
              <Link href={`/review/${first.id}`}>Start reviewing</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
            <CheckCircle2Icon className="size-8 text-muted-foreground" />
            <p className="font-medium text-sm">All caught up</p>
            <p className="max-w-sm text-muted-foreground text-sm">
              Everything extraction proposed has been reviewed. New captures
              land here within seconds.
            </p>
            <Button asChild variant="outline">
              <Link href="/">Ask the brain</Link>
            </Button>
          </div>
        )}
      </Desk>
    </>
  );
};

export default ReviewPage;
