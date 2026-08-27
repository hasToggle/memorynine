// Streamdown's sanitizer rewrites `id` attributes to "user-content-…" as
// DOM-clobbering protection (the GitHub convention), so the attribute arrives
// prefixed even though the model emitted the bare id. Stripping it is
// load-bearing: without it every citation resolves to nothing and renders as
// broken.

const CLOBBER_PREFIX = /^user-content-/;

export interface CitationRef {
  id: string;
  kind: "fact" | "source";
}

export const normalizeCitationId = (raw?: string): string | undefined => {
  const id = raw?.replace(CLOBBER_PREFIX, "");
  return id && id.length > 0 ? id : undefined;
};
