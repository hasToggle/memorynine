"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { SourceListItem } from "@/app/actions/knowledge/list-sources";
import { NoteForm } from "./note-form";
import { Recorder } from "./recorder";
import { SourceList } from "./source-list";

export const CapturePane = ({ sources }: { sources: SourceListItem[] }) => {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-sm">Note</h2>
          <p className="text-muted-foreground text-xs">
            Paste or type what the brain should remember.
          </p>
        </div>
        <NoteForm onCaptured={refresh} />
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-sm">Voice memo</h2>
          <p className="text-muted-foreground text-xs">
            Record after a call — names and details are the point, so speak them
            out. Financial and medical details are redacted automatically during
            transcription.
          </p>
        </div>
        <Recorder onCaptured={refresh} />
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-sm">Recent captures</h2>
          <p className="text-muted-foreground text-xs">
            The pipeline picks sources up within five minutes: transcribe →
            extract → propose. Confirmed knowledge lands via Review.
          </p>
        </div>
        <SourceList sources={sources} />
      </section>
    </div>
  );
};
