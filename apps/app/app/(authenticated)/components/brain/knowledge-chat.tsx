"use client";

import {
  Conversation,
  ConversationContent,
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
import type { Brief } from "@repo/knowledge";
import { type UseEveAgentStatus, useEveAgent } from "eve/react";
import { type ComponentProps, useCallback, useMemo, useState } from "react";
import type { CitationRef } from "@/lib/citation";
import { collectCitables, isToolPart, unwrapToolOutput } from "@/lib/eve-parts";
import { BriefPane } from "./brief-pane";
import { SelectedCitationProvider } from "./citation-chip";
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

// Derived from the component rather than imported from "ai", which apps/app
// does not depend on directly.
type SubmitStatus = ComponentProps<typeof PromptInputSubmit>["status"];

// PromptInputSubmit speaks the AI SDK's ChatStatus; eve's store reports only
// idle / busy / resuming, with failures in `error`. A resume and the gap before
// the first streamed part are both pre-turn waits, so they read as "submitted"
// — the spinner. The rest of a busy turn is "streaming".
const toSubmitStatus = ({
  awaitingResponse,
  hasError,
  status,
}: {
  awaitingResponse: boolean;
  hasError: boolean;
  status: UseEveAgentStatus;
}): SubmitStatus => {
  if (status === "resuming" || awaitingResponse) {
    return "submitted";
  }
  if (status === "busy") {
    return "streaming";
  }
  return hasError ? "error" : "ready";
};

const thinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>Thinking…</Shimmer>;
  }
  if (duration === undefined) {
    return <p>Thought for a moment</p>;
  }
  return <p>Thought for {duration}s</p>;
};

/**
 * Builds the `fact`/`source` renderer pair for one message's citations. Kept
 * as a plain function, not a hook — it holds no state of its own, and
 * `componentsFor` below needs to build one of these per message inside a
 * render-time loop, which hooks cannot do.
 *
 * `MessageResponse` is `memo`-wrapped, which might suggest caching this
 * result to preserve identity across renders — but eve's reducer rebuilds
 * `agent.messages` (and every message's `parts` array) on every
 * streamed event, so `facts`/`sources` below get a new `Map` on every
 * render regardless. A cache keyed on those would never hit during a
 * stream, the one case it would matter for, while still growing for the
 * life of the conversation. Not worth it: build fresh every call.
 *
 * Which chip is *open* deliberately does not travel through here. That memo
 * compares only `children` and `isAnimating`, so a new `components` object
 * alone never repaints the subtree; once an answer has finished streaming its
 * text is frozen and nothing else would. Selection goes through
 * `SelectedCitationProvider` instead, which reaches the chips past the memo.
 */
const buildCitationComponents = ({
  facts,
  messageId,
  numbering,
  select,
  sources,
}: {
  facts: Map<string, CitedFact>;
  messageId: string;
  numbering: (messageId: string, citationId: string) => number;
  select: (messageId: string, reference: CitationRef) => void;
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
      />
    ),
    source: ({ id }: { id?: string }) => (
      <SourceCitation
        id={id}
        numberOf={numberOf}
        onSelect={onSelect}
        sources={sources}
      />
    ),
  };
};

export const KnowledgeChat = ({ briefs }: { briefs: Brief[] }) => {
  const agent = useEveAgent();
  const isBusy = agent.status === "busy";
  // The store is replaying an attached session and refuses new turns, so the
  // composer stays locked alongside isBusy.
  const isResuming = agent.status === "resuming";
  const isLocked = isBusy || isResuming;

  // Covers the gap between sending and the first streamed part — once the
  // assistant's reasoning starts arriving, its own "Thinking…" takes over.
  const lastMessage = agent.messages.at(-1);
  const awaitingResponse =
    isBusy &&
    (lastMessage?.role !== "assistant" || lastMessage.parts.length === 0);
  const submitStatus = toSubmitStatus({
    awaitingResponse,
    hasError: agent.error !== undefined,
    status: agent.status,
  });

  const { facts, sources } = useMemo(
    () => collectCitables(agent.messages),
    [agent.messages]
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

  // Sequence numbers are per answer: a 24-character ObjectId is precise and
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

  const componentsFor = useCallback(
    (messageId: string) =>
      buildCitationComponents({
        facts,
        messageId,
        numbering,
        select,
        sources,
      }),
    [facts, numbering, select, sources]
  );

  // PromptInput owns the textarea and hands back the composed message, so the
  // composer state lives there rather than being mirrored here.
  const submit = useCallback(
    (message: { text?: string }) => {
      const text = message.text?.trim() ?? "";
      if (text.length === 0 || isLocked) {
        return;
      }
      // Rejections surface through agent.error, which the view renders; this
      // catch only keeps the promise from floating.
      // eve 0.31.0 made send() positional: send(message, options) instead of
      // send({ message }).
      agent.send(text).catch(() => undefined);
    },
    [agent, isLocked]
  );

  // Sends directly rather than seeding the composer: PromptInput owns its
  // own textarea state, so mirroring that state up here just to prefill it
  // would cost more than it buys — and the button already reads as an
  // action ("ask about X"), not as autofill the reader still has to submit.
  const askAbout = useCallback(
    (name: string) => {
      if (isLocked) {
        return;
      }
      agent
        .send(`What should I know before I talk to ${name}?`)
        .catch(() => undefined);
    },
    [agent, isLocked]
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl min-w-0 flex-col gap-3">
      <Conversation className="min-h-0 flex-1 rounded-xl border">
        <ConversationContent
          // Center only the true cold-start card — it's small and fixed
          // height. A populated brief pane can run to several cards taller
          // than the frame, and justify-center on overflowing content pushes
          // its top out of reach (the failure mode this rule exists to
          // avoid), so real briefs render top-aligned instead.
          className={
            agent.messages.length === 0 && briefs.length === 0
              ? "min-h-full justify-center"
              : undefined
          }
        >
          {agent.messages.length === 0 ? (
            <BriefPane briefs={briefs} onAsk={askAbout} />
          ) : null}

          {agent.messages.map((message) => (
            <Message from={message.role} key={message.id}>
              {/* Each answer owns its own open receipt. The provider sits
                  above MessageResponse's memo boundary on purpose: a context
                  value change reaches the chips inside even when that memo
                  refuses to re-render the markdown around them. */}
              <SelectedCitationProvider selectedId={selected[message.id]?.id}>
                <MessageContent>
                  {message.parts.map((part, index) => {
                    if (part.type === "reasoning") {
                      const reasoning = part as {
                        state?: string;
                        text?: string;
                      };
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

                    if (isToolPart(part)) {
                      const { errorText, value } = unwrapToolOutput(
                        part.output
                      );
                      const output = value as
                        | {
                            facts?: unknown[];
                            searched?: string;
                            sources?: unknown[];
                          }
                        | undefined;
                      return (
                        <SearchSummary
                          errorText={part.error?.message ?? errorText}
                          factCount={output?.facts?.length ?? 0}
                          // biome-ignore lint/suspicious/noArrayIndexKey: stream parts have no stable id and are append-only
                          key={index}
                          query={
                            output?.searched ??
                            (part.input as { query?: string } | undefined)
                              ?.query
                          }
                          sourceCount={output?.sources?.length ?? 0}
                          state={part.state}
                        />
                      );
                    }

                    return null;
                  })}
                </MessageContent>

                {selected[message.id] ? (
                  <ReceiptPanel receipt={receipts[selected[message.id].id]} />
                ) : null}
              </SelectedCitationProvider>
            </Message>
          ))}

          {awaitingResponse ? (
            <Shimmer className="text-sm" duration={1.5}>
              One moment…
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
            disabled={isLocked}
            placeholder="Ask the company brain…"
          />
        </PromptInputBody>
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit disabled={isLocked} status={submitStatus} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
};
