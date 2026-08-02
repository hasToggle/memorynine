"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { SourceListItem } from "@/app/actions/knowledge/list-sources";

const STATUS_VARIANT: Record<
  string,
  "default" | "destructive" | "outline" | "secondary"
> = {
  extracting: "secondary",
  failed: "destructive",
  proposed: "default",
  received: "outline",
  reviewed: "outline",
  transcribed: "secondary",
  transcribing: "secondary",
};

const REFRESH_INTERVAL_MS = 15_000;

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);

export const SourceList = ({ sources }: { sources: SourceListItem[] }) => {
  const router = useRouter();

  // The pipeline advances sources in the background — keep the view live.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  if (sources.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing captured yet — record a memo or write a note above.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sources.map((source) => (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border p-3"
          key={source.id}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{source.type}</Badge>
              <Badge variant={STATUS_VARIANT[source.status] ?? "outline"}>
                {source.status}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatDate(source.createdAt)}
              </span>
            </div>
            {source.preview ? (
              <p className="truncate text-muted-foreground text-sm">
                {source.preview}
              </p>
            ) : null}
            {source.error ? (
              <p className="truncate text-destructive text-xs">
                {source.error}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};
