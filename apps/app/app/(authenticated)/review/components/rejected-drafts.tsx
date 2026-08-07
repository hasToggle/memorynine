import type { ReviewRejectedDraft } from "@/app/actions/knowledge/get-proposal";

// Drafts the model produced that failed validation. Recorded for judgment,
// but debugging material — collapsed by default at the bottom of the desk.

export const RejectedDrafts = ({
  drafts,
}: {
  drafts: ReviewRejectedDraft[];
}) => (
  <details className="group rounded-xl border border-dashed px-4 py-3">
    <summary className="cursor-pointer list-none font-medium text-muted-foreground text-sm marker:hidden group-open:mb-3">
      {drafts.length} rejected draft{drafts.length === 1 ? "" : "s"} — model
      output that failed validation
    </summary>
    <div className="flex flex-col gap-3">
      {drafts.map((draft, index) => (
        <div
          className="flex flex-col gap-1"
          // biome-ignore lint/suspicious/noArrayIndexKey: rejected drafts carry no id — the list is a fixed, never-reordered snapshot from the proposal document
          key={index}
        >
          <p className="text-sm">{draft.reason}</p>
          <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 text-muted-foreground text-xs">
            {JSON.stringify(draft.raw, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  </details>
);
