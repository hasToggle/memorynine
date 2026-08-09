import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listBriefs } from "@/app/actions/knowledge/list-briefs";
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
    // Signed in but not in any organization yet — the join surface offers
    // invitations, domain-matching orgs, and a create fallback.
    redirect("/join");
  }

  const [sources, openProposals, skippedProposals, people, briefs] =
    await Promise.all([
      listRecentSources(),
      listOpenProposals(),
      listSkippedProposals(),
      listPeople(),
      listBriefs(),
    ]);

  return (
    <>
      <Header page="Brain" />
      <BrainWorkspace
        ask={<KnowledgeChat briefs={briefs} />}
        capture={<CapturePane sources={sources} />}
        openReviewCount={openProposals.length}
        people={<PeoplePane people={people} />}
        review={<ReviewPane open={openProposals} skipped={skippedProposals} />}
      />
    </>
  );
};

export default BrainPage;
