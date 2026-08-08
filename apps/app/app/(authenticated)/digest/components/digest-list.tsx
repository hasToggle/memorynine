import Link from "next/link";

interface DigestSummary {
  id: string;
  misconception: string;
  sentAt: Date | null;
  series?: { name: string; part: number };
  title: string;
}

interface DigestListProps {
  digests: DigestSummary[];
}

export function DigestList({ digests }: DigestListProps) {
  if (digests.length === 0) {
    return (
      <p className="mt-8 text-muted-foreground">
        No digests published yet. Check back soon.
      </p>
    );
  }

  // Group by series
  const standalone: DigestSummary[] = [];
  const seriesMap = new Map<string, DigestSummary[]>();

  for (const digest of digests) {
    if (digest.series) {
      const existing = seriesMap.get(digest.series.name) ?? [];
      existing.push(digest);
      seriesMap.set(digest.series.name, existing);
    } else {
      standalone.push(digest);
    }
  }

  // Sort series entries by part number
  for (const entries of seriesMap.values()) {
    entries.sort((a, b) => (a.series?.part ?? 0) - (b.series?.part ?? 0));
  }

  return (
    <div className="mt-8 space-y-8">
      {Array.from(seriesMap.entries()).map(([seriesName, entries]) => (
        <div key={seriesName}>
          <h2 className="mb-4 font-semibold text-lg">{seriesName}</h2>
          <div className="space-y-2">
            {entries.map((d) => (
              <DigestCard digest={d} key={d.id} showPart />
            ))}
          </div>
        </div>
      ))}

      {standalone.length > 0 && (
        <div className="space-y-2">
          {standalone.map((d) => (
            <DigestCard digest={d} key={d.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestCard({
  digest,
  showPart,
}: {
  digest: DigestSummary;
  showPart?: boolean;
}) {
  return (
    <Link
      className="block rounded-lg border p-4 transition-colors hover:bg-accent"
      href={`/digest/${digest.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          {showPart && digest.series ? (
            <span className="text-muted-foreground text-xs">
              Part {digest.series.part}
            </span>
          ) : null}
          <h3 className="font-medium">{digest.title}</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {digest.misconception}
          </p>
        </div>
        {digest.sentAt ? (
          <time className="shrink-0 text-muted-foreground text-xs">
            {new Date(digest.sentAt).toLocaleDateString()}
          </time>
        ) : null}
      </div>
    </Link>
  );
}
