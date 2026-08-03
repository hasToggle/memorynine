import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "../components/header";
import { KnowledgeChat } from "./components/knowledge-chat";

export const metadata: Metadata = {
  description: "Ask the company brain, with every claim cited to a fact.",
  title: "Ask",
};

const AskPage = async () => {
  // The agent derives its own tenant from the same better-auth session; this
  // check only keeps the page itself off-limits without an active org.
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }

  return (
    <>
      <Header page="Ask" pages={["Knowledge"]} />
      <div className="flex min-h-0 flex-1 flex-col p-4 pt-0">
        <KnowledgeChat />
      </div>
    </>
  );
};

export default AskPage;
