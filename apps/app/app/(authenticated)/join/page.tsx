import {
  auth,
  getSessionUser,
  listJoinableOrganizations,
  listUserPendingInvitations,
} from "@repo/auth/server";
import type { Metadata } from "next";
import { Header } from "../components/header";
import { JoinPanel } from "./components/join-panel";

export const metadata: Metadata = {
  description: "Join your team's existing brain, or create a new one.",
  title: "Join your team",
};

const JoinPage = async () => {
  const user = await getSessionUser();
  const { orgId, redirectToSignIn } = await auth();
  if (!user) {
    return redirectToSignIn();
  }

  const [invitations, joinable] = user.emailVerified
    ? await Promise.all([
        listUserPendingInvitations(),
        listJoinableOrganizations(),
      ])
    : [[], []];

  return (
    <>
      <Header
        page="Join"
        pages={orgId ? [{ href: "/", label: "Brain" }] : []}
      />
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pt-8">
        <JoinPanel
          email={user.email}
          emailVerified={user.emailVerified}
          hasActiveOrganization={Boolean(orgId)}
          invitations={invitations}
          joinable={joinable}
        />
      </div>
    </>
  );
};

export default JoinPage;
