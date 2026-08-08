import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDigestById } from "@/app/actions/digests/get";

interface DigestDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: DigestDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const digest = await getDigestById(id);
  if (!digest) {
    return { title: "Not Found" };
  }
  return {
    description: digest.misconception,
    title: digest.title,
  };
}

export default async function DigestDetailPage({
  params,
}: DigestDetailPageProps) {
  const { id } = await params;
  const digest = await getDigestById(id);

  if (!digest) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl p-8">
      {digest.series ? (
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {digest.series.name} &mdash; Part {digest.series.part}
        </p>
      ) : null}
      <h1 className="mt-2 font-bold text-3xl tracking-tight">{digest.title}</h1>
      <p className="mt-2 text-lg text-muted-foreground italic">
        &ldquo;{digest.misconception}&rdquo;
      </p>
      {digest.sentAt ? (
        <time className="mt-4 block text-muted-foreground text-sm">
          {new Date(digest.sentAt).toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </time>
      ) : null}
      <hr className="my-8" />
      <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
        {digest.content}
      </div>
    </article>
  );
}
