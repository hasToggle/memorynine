"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@repo/design-system/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@repo/design-system/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@repo/design-system/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@repo/design-system/components/ai-elements/reasoning";
import { Shimmer } from "@repo/design-system/components/ai-elements/shimmer";
import { useEveAgent } from "eve/react";
import { BrainIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { CitationRef } from "@/lib/citation";
import { type CitedFact, FactCitation } from "./fact-citation";
import { ReceiptPanel } from "./receipt-panel";
import { SearchSummary } from "./search-summary";
import { type CitedSource, SourceCitation } from "./source-citation";
import { useReceipts } from "./use-receipts";

// The model emits <fact id="…"/> and <source id="…"/> inline. Streamdown
// strips unknown tags by default, so each tag and its one attribute have to
// be allow-listed explicitly — which also means nothing else the model
// invents can reach the DOM.
const ALLOWED_TAGS = { fact: ["id"], source: ["id"] };

interface ToolPart {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
  type: string;
}

const isSearchTool = (part: { type: string }) =>
  part.type === "tool-search-knowledge" ||
  part.type === "dynamic-tool" ||
  part.type.startsWith("tool-");

/**
 * eve delivers tool results in the AI SDK result envelope
 * `{ type: "json" | "error-text" | …, value }`, so the payload lives one
 * level down. Unwrap defensively — a bare payload passes through untouched.
 */
const unwrapToolOutput = (
  output: unknown
): { errorText?: string; value?: unknown } => {
  if (output === null || typeof output !== "object") {
    return { value: output };
  }
  const { type, value } = output as { type?: unknown; value?: unknown };
  if (type === "error-text" || type === "error-json") {
    return {
      errorText: typeof value === "string" ? value : JSON.stringify(value),
    };
  }
  if (type === "json" || type === "text" || type === "content") {
    return { value };
  }
  return { value: output };
};

/**
 * Collect everything the agent has retrieved so far — confirmed facts and raw
 * sources. Citations resolve against tool output, never against the prose:
 * the model can only cite what the knowledge base actually handed it.
 */
const ingestToolOutput = (
  raw: unknown,
  facts: Map<string, CitedFact>,
  sources: Map<string, CitedSource>
) => {
  const output = unwrapToolOutput(raw).value as
    | { facts?: CitedFact[]; sources?: CitedSource[] }
    | undefined;
  for (const fact of output?.facts ?? []) {
    if (fact?.id) {
      facts.set(fact.id, fact);
    }
  }
  for (const source of output?.sources ?? []) {
    if (source?.id) {
      sources.set(source.id, source);
    }
  }
};

const collectCitables = (
  messages: { parts: { output?: unknown; type: string }[] }[]
): { facts: Map<string, CitedFact>; sources: Map<string, CitedSource> } => {
  const facts = new Map<string, CitedFact>();
  const sources = new Map<string, CitedSource>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (isSearchTool(part)) {
        ingestToolOutput(part.output, facts, sources);
      }
    }
  }
  return { facts, sources };
};

const thinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>Denkt nach …</Shimmer>;
  }
  if (duration === undefined) {
    return <p>Kurz nachgedacht</p>;
  }
  return <p>{duration}s nachgedacht</p>;
};

/**
 * Builds the `fact`/`source` renderer pair for one message's citations. Kept
 * as a plain function (not a hook) so `KnowledgeChat` can cache the result
 * per message in `componentsFor` below, rather than handing `MessageResponse`
 * — which is `memo`-wrapped — a brand-new `components` object on every
 * render. A fresh object there would defeat that memo and force Streamdown to
 * re-parse and remount every citation on every streamed token, not just the
 * message that actually changed.
 */
const buildCitationComponents = ({
  facts,
  messageId,
  numbering,
  select,
  selectedId,
  sources,
}: {
  facts: Map<string, CitedFact>;
  messageId: string;
  numbering: (messageId: string, citationId: string) => number;
  select: (messageId: string, reference: CitationRef) => void;
  selectedId: string | undefined;
  sources: Map<string, CitedSource>;
}) => {
  const numberOf = (citationId: string) => numbering(messageId, citationId);
  const onSelect = (reference: CitationRef) => select(messageId, reference);
  return {
    fact: ({ id }: { id?: string }) => (
      <FactCitation
        facts={facts}
        id={id}
        numberOf={numberOf}
        onSelect={onSelect}
        selectedId={selectedId}
      />
    ),
    source: ({ id }: { id?: string }) => (
      <SourceCitation
        id={id}
        numberOf={numberOf}
        onSelect={onSelect}
        selectedId={selectedId}
        sources={sources}
      />
    ),
  };
};

export const KnowledgeChat = () => {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  // Covers the gap between sending and the first streamed part — once the
  // assistant's reasoning starts arriving, its own "Denkt nach …" takes over.
  const lastMessage = agent.data.messages.at(-1) as
    | { parts: unknown[]; role?: string }
    | undefined;
  const awaitingResponse =
    isBusy &&
    (lastMessage?.role !== "assistant" || lastMessage.parts.length === 0);

  const { facts, sources } = useMemo(
    () => collectCitables(agent.data.messages as never),
    [agent.data.messages]
  );

  const { load, receipts } = useReceipts();
  const [selected, setSelected] = useState<Record<string, CitationRef>>({});

  const select = useCallback(
    (messageId: string, reference: CitationRef) => {
      if (reference.id.length === 0) {
        return;
      }
      setSelected((current) => ({ ...current, [messageId]: reference }));
      load(reference);
    },
    [load]
  );

  // Sequence numbers are per answer: an eight-character hex id is precise and
  // unreadable, and the number only has to distinguish the chips in front of
  // the reader. A message's citations only ever append as it streams in, so
  // first-seen order is stable and the counters below never need to reset.
  const numbering = useMemo(() => {
    const counters = new Map<string, Map<string, number>>();
    return (messageId: string, citationId: string) => {
      let seen = counters.get(messageId);
      if (!seen) {
        seen = new Map();
        counters.set(messageId, seen);
      }
      const existing = seen.get(citationId);
      if (existing !== undefined) {
        return existing;
      }
      const next = seen.size + 1;
      seen.set(citationId, next);
      return next;
    };
  }, []);

  // Cache the built `components` object per message, keyed by the inputs
  // that message's chips actually read. A render that doesn't change any of
  // those returns the same object identity, keeping MessageResponse's memo
  // — and Streamdown's own incremental-parse cache — intact.
  const citationComponentsRef = useRef(
    new Map<
      string,
      {
        components: ReturnType<typeof buildCitationComponents>;
        facts: Map<string, CitedFact>;
        selectedId: string | undefined;
        sources: Map<string, CitedSource>;
      }
    >()
  );

  const componentsFor = useCallback(
    (messageId: string) => {
      const selectedId = selected[messageId]?.id;
      const cache = citationComponentsRef.current;
      const cached = cache.get(messageId);
      if (
        cached &&
        cached.facts === facts &&
        cached.sources === sources &&
        cached.selectedId === selectedId
      ) {
        return cached.components;
      }
      const components = buildCitationComponents({
        facts,
        messageId,
        numbering,
        select,
        selectedId,
        sources,
      });
      cache.set(messageId, { components, facts, selectedId, sources });
      return components;
    },
    [facts, numbering, select, sources, selected]
  );

  // PromptInput owns the textarea and hands back the composed message, so the
  // composer state lives there rather than being mirrored here.
  const submit = useCallback(
    (message: { text?: string }) => {
      const text = message.text?.trim() ?? "";
      if (text.length === 0 || isBusy) {
        return;
      }
      // Rejections surface through agent.error, which the view renders; this
      // catch only keeps the promise from floating.
      // eve 0.31.0 made send() positional: send(message, options) instead of
      // send({ message }).
      agent.send(text).catch(() => undefined);
    },
    [agent, isBusy]
  );

  return (
    <div className="mx-auto flex h-full w-full min-w-0 max-w-3xl flex-col gap-3">
      <Conversation className="min-h-0 flex-1 rounded-xl border">
        <ConversationContent
          // Center the empty state in the frame; harmless with messages
          // present, but overflowing content must not be justify-centered or
          // its top becomes unreachable.
          className={
            agent.data.messages.length === 0
              ? "min-h-full justify-center"
              : undefined
          }
        >
          {agent.data.messages.length === 0 ? (
            <ConversationEmptyState
              description="Jede Antwort zitiert die Fakten, auf denen sie beruht."
              icon={<BrainIcon className="size-8" />}
              title="Frag das Firmengedächtnis"
            />
          ) : null}

          {agent.data.messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === "reasoning") {
                    const reasoning = part as { state?: string; text?: string };
                    return (
                      <Reasoning
                        className="w-full"
                        isStreaming={reasoning.state === "streaming"}
                        // biome-ignore lint/suspicious/noArrayIndexKey: stream parts have no stable id and are append-only
                        key={index}
                      >
                        <ReasoningTrigger
                          getThinkingMessage={thinkingMessage}
                        />
                        <ReasoningContent>
                          {reasoning.text ?? ""}
                        </ReasoningContent>
                      </Reasoning>
                    );
                  }

                  if (part.type === "text") {
                    return (
                      <MessageResponse
                        allowedTags={ALLOWED_TAGS}
                        components={componentsFor(message.id)}
                        // biome-ignore lint/suspicious/noArrayIndexKey: stream parts have no stable id and are append-only
                        key={index}
                      >
                        {part.text}
                      </MessageResponse>
                    );
                  }

                  if (isSearchTool(part)) {
                    const tool = part as ToolPart;
                    const { value } = unwrapToolOutput(tool.output);
                    const output = value as
                      | {
                          facts?: unknown[];
                          searched?: string;
                          sources?: unknown[];
                        }
                      | undefined;
                    return (
                      <SearchSummary
                        factCount={output?.facts?.length ?? 0}
                        // biome-ignore lint/suspicious/noArrayIndexKey: stream parts have no stable id and are append-only
                        key={index}
                        query={
                          output?.searched ??
                          (tool.input as { query?: string } | undefined)?.query
                        }
                        sourceCount={output?.sources?.length ?? 0}
                        state={tool.state}
                      />
                    );
                  }

                  return null;
                })}
              </MessageContent>

              {selected[message.id] ? (
                <ReceiptPanel receipt={receipts[selected[message.id].id]} />
              ) : null}
            </Message>
          ))}

          {awaitingResponse ? (
            <Shimmer className="text-sm" duration={1.5}>
              Einen Moment …
            </Shimmer>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {agent.error ? (
        <p className="text-destructive text-sm">{agent.error.message}</p>
      ) : null}

      {/* Match the conversation frame's radius on the composer's InputGroup,
          which PromptInput renders internally. */}
      <PromptInput
        className="[&>[data-slot=input-group]]:rounded-xl"
        onSubmit={submit}
      >
        <PromptInputBody>
          <PromptInputTextarea
            className="min-h-0"
            disabled={isBusy}
            placeholder="Was möchtest du wissen?"
          />
        </PromptInputBody>
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit disabled={isBusy} status={agent.status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
};
