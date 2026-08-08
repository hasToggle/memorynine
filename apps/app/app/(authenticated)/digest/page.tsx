import type { Metadata } from "next";
import { getPublishedDigests } from "@/app/actions/digests/get";
import { DigestList } from "./components/digest-list";

export const metadata: Metadata = {
  description: "Browse past weekly misconception-busting digests",
  title: "Digest Archive",
};

export default async function DigestPage() {
  const digests = await getPublishedDigests();

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="font-bold text-3xl tracking-tight">Digest Archive</h1>
      <p className="mt-2 text-muted-foreground">
        Weekly misconception-busting pieces on AI-empowered web development.
      </p>
      <DigestList digests={digests} />
    </div>
  );
}
