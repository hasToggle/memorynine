export const PROMPT = "my dashboard takes 3s to load. how do I make it faster?";

export const GROUNDING_AMENDMENT =
  "+ use Context7 for the current Next.js docs";

export const RETRIEVED_DOCS = [
  "nextjs.org/docs/app/getting-started/cache-components",
  "nextjs.org/docs/app/api-reference/directives/use-cache",
  "nextjs.org/docs/app/api-reference/functions/cacheLife",
  "nextjs.org/docs/app/getting-started/fetching-data",
] as const;

export interface UngroundedToken {
  id: string;
  text: string;
}

const RAW_UNGROUNDED_TOKENS: { text: string }[] = [
  {
    text: "First, move your data fetching to a Server Component if it isn’t already. Then add ",
  },
  { text: "`export const revalidate = 60`" },
  {
    text: " to cache the page for a minute at a time. For interactive parts, wrap them in ",
  },
  { text: "`<Suspense>`" },
  {
    text: " so the shell streams in immediately. Most dashboards that follow this pattern see render times drop by 80–90%.",
  },
];

export const UNGROUNDED_TOKENS: UngroundedToken[] = RAW_UNGROUNDED_TOKENS.map(
  (token, index) => ({ ...token, id: `tok-${index}` })
);

export type ApiName = "use cache" | "cacheLife" | "Suspense";

export type GroundedSegment =
  | { kind: "text"; text: string }
  | { kind: "api"; text: string; api: ApiName }
  | { kind: "profiling"; text: string }
  | { kind: "dismissive"; text: string };

export const GROUNDED_PARAGRAPH: { segments: GroundedSegment[] } = {
  segments: [
    {
      kind: "text",
      text: "Move your fetches to a Server Component and mark them with ",
    },
    { api: "use cache", kind: "api", text: "'use cache'" },
    { kind: "text", text: " plus " },
    { api: "cacheLife", kind: "api", text: "cacheLife('minutes')" },
    { kind: "text", text: ". Use " },
    { api: "Suspense", kind: "api", text: "<Suspense>" },
    {
      kind: "text",
      text: " boundaries to stream the rest of the shell in parallel. ",
    },
    {
      kind: "profiling",
      text: "If after that you’re still seeing >1s loads, you can profile with the React DevTools Profiler or check the Network tab for slow requests. ",
    },
    {
      kind: "dismissive",
      text: "In most cases, though, the caching changes alone will get you under 500ms.",
    },
  ],
};

export const API_TOOLTIPS: Record<ApiName, string> = {
  cacheLife: "verified against retrieved docs.",
  Suspense: "verified against retrieved docs.",
  "use cache": "verified against retrieved docs.",
};
