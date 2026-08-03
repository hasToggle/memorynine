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
  PromptInputSubmit,
  PromptInputTextarea,
} from "@repo/design-system/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@repo/design-system/components/ai-elements/tool";
import { useEveAgent } from "eve/react";
import { BrainIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { type CitedFact, FactCitation } from "./fact-citation";

// The model emits <fact id="…"/> inline. Streamdown strips unknown tags by
// default, so the tag and its one attribute have to be allow-listed explicitly
// — which also means nothing else the model invents can reach the DOM.
const ALLOWED_TAGS = { fact: ["id"] };

interface ToolPart {
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
 * Collect every fact the agent has retrieved so far. Citations resolve against
 * tool output, never against the prose: the model can only cite what the
 * knowledge base actually handed it.
 */
const collectFacts = (
  messages: { parts: { output?: unknown; type: string }[] }[]
): Map<string, CitedFact> => {
  const byId = new Map<string, CitedFact>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isSearchTool(part)) {
        continue;
      }
      const output = part.output as { facts?: CitedFact[] } | undefined;
      for (const fact of output?.facts ?? []) {
        if (fact?.id) {
          byId.set(fact.id, fact);
        }
      }
    }
  }
  return byId;
};

export const KnowledgeChat = () => {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  const facts = useMemo(
    () => collectFacts(agent.data.messages as never),
    [agent.data.messages]
  );

  const components = useMemo(
    () => ({
      fact: ({ id }: { id?: string }) => <FactCitation facts={facts} id={id} />,
    }),
    [facts]
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
      agent.send({ message: text }).catch(() => undefined);
    },
    [agent, isBusy]
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
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
                  if (part.type === "text") {
                    return (
                      <MessageResponse
                        allowedTags={ALLOWED_TAGS}
                        components={components}
                        // biome-ignore lint/suspicious/noArrayIndexKey: stream parts have no stable id and are append-only
                        key={index}
                      >
                        {part.text}
                      </MessageResponse>
                    );
                  }

                  if (isSearchTool(part)) {
                    const tool = part as ToolPart;
                    return (
                      <Tool
                        // biome-ignore lint/suspicious/noArrayIndexKey: see above
                        key={index}
                      >
                        <ToolHeader
                          state={tool.state as never}
                          type={tool.type as never}
                        />
                        <ToolContent>
                          <ToolInput input={tool.input} />
                          <ToolOutput
                            errorText={undefined}
                            output={tool.output as never}
                          />
                        </ToolContent>
                      </Tool>
                    );
                  }

                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {agent.error ? (
        <p className="text-destructive text-sm">{agent.error.message}</p>
      ) : null}

      <PromptInput onSubmit={submit}>
        <PromptInputBody>
          <PromptInputTextarea
            disabled={isBusy}
            placeholder="Was möchtest du wissen?"
          />
        </PromptInputBody>
        <PromptInputSubmit disabled={isBusy} status={agent.status} />
      </PromptInput>
    </div>
  );
};
