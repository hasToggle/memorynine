import { render } from "@react-email/render";
import { auth } from "@repo/auth/server";
import { database, ObjectId } from "@repo/database";
import DigestEmail from "@repo/email/templates/digest";
import { notFound } from "next/navigation";

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function DigestPreviewPage({ params }: PreviewPageProps) {
  const { has } = await auth();
  if (!has({ role: "org:admin" })) {
    notFound();
  }

  const { id } = await params;

  const digest = await database.digest.findOne({
    _id: new ObjectId(id),
  });

  if (!digest) {
    notFound();
  }

  const emailHtml = await render(
    DigestEmail({
      content: digest.content,
      misconception: digest.misconception,
      series: digest.series,
      title: digest.title,
    })
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-bold text-xl">Email Preview</h1>
        <span className="rounded-full border px-3 py-1 text-muted-foreground text-xs">
          {digest.status}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <iframe
          className="h-[800px] w-full"
          sandbox=""
          srcDoc={emailHtml}
          title="Email preview"
        />
      </div>
    </div>
  );
}
