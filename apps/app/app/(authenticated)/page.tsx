import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPeople } from "@/app/actions/knowledge/list-people";
import {
  listOpenProposals,
  listSkippedProposals,
} from "@/app/actions/knowledge/list-proposals";
import { listRecentSources } from "@/app/actions/knowledge/list-sources";
import { CapturePane } from "./components/brain/capture-pane";
import { KnowledgeChat } from "./components/brain/knowledge-chat";
import { PeoplePane } from "./components/brain/people-pane";
import { ReviewPane } from "./components/brain/review-pane";
import { BrainWorkspace } from "./components/brain/workspace";
import { Header } from "./components/header";

export const metadata: Metadata = {
  description:
    "Ask the company brain, feed it, and review what it learned — one place.",
  title: "Brain",
};

const BrainPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }

  const [sources, openProposals, skippedProposals, people] = await Promise.all([
    listRecentSources(),
    listOpenProposals(),
    listSkippedProposals(),
    listPeople(),
  ]);

  return (
    <>
      <Header page="Brain" />
      <BrainWorkspace
        ask={<KnowledgeChat />}
        capture={<CapturePane sources={sources} />}
        openReviewCount={openProposals.length}
        people={<PeoplePane people={people} />}
        review={<ReviewPane open={openProposals} skipped={skippedProposals} />}
      />
    </>
  );
};

export default BrainPage;
