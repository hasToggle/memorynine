import { auth } from "@repo/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listRecentSources } from "@/app/actions/knowledge/list-sources";
import { Header } from "../components/header";
import { CapturePanels } from "./components/capture-panels";
import { SourceList } from "./components/source-list";

export const metadata: Metadata = {
  description: "Record a voice memo or write a note into the company brain.",
  title: "Capture",
};

const CapturePage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }
  const sources = await listRecentSources();

  return (
    <>
      <Header page="Capture" pages={["Knowledge"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CapturePanels />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent captures</CardTitle>
            <CardDescription>
              The pipeline picks sources up within five minutes: transcribe →
              extract → propose. Confirmed knowledge lands via Review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SourceList sources={sources} />
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default CapturePage;
