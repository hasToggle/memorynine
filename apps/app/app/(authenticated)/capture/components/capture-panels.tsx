"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { NoteForm } from "./note-form";
import { Recorder } from "./recorder";

export const CapturePanels = () => {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voice memo</CardTitle>
          <CardDescription>
            Record after a call — names and details are the point, so speak them
            out. Financial and medical details are redacted automatically during
            transcription.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Recorder onCaptured={refresh} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Note</CardTitle>
          <CardDescription>
            Paste or type what you want the brain to remember.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NoteForm onCaptured={refresh} />
        </CardContent>
      </Card>
    </div>
  );
};
