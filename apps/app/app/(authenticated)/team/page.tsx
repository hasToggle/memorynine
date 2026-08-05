import { getSessionUser, getTeamOverview } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "../components/header";
import { TeamView } from "./components/team-view";

export const metadata: Metadata = {
  description: "Who shares this brain — members, invitations, and domains.",
  title: "Team",
};

const TeamPage = async () => {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }
  const overview = await getTeamOverview();
  if (!overview) {
    redirect("/join");
  }

  return (
    <>
      <Header page="Team" pages={[{ href: "/", label: "Brain" }]} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 pt-0">
        <TeamView overview={overview} sessionEmail={user.email} />
      </div>
    </>
  );
};

export default TeamPage;
