"use client";

import { cn } from "@repo/design-system/lib/utils";
import {
  BrainIcon,
  ClipboardCheckIcon,
  type LucideIcon,
  MicIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

type MemoryTab = "capture" | "people" | "review";
type View = MemoryTab | "ask";

interface BrainWorkspaceProperties {
  readonly ask: ReactNode;
  readonly capture: ReactNode;
  readonly openReviewCount: number;
  readonly people: ReactNode;
  readonly review: ReactNode;
}

const MEMORY_TABS: { icon: LucideIcon; key: MemoryTab; label: string }[] = [
  { icon: MicIcon, key: "capture", label: "Capture" },
  { icon: ClipboardCheckIcon, key: "review", label: "Review" },
  { icon: UsersIcon, key: "people", label: "People" },
];

const SegmentButton = ({
  active,
  count,
  icon: Icon,
  label,
  onSelect,
  value,
}: {
  active: boolean;
  count?: number;
  icon: LucideIcon;
  label: string;
  onSelect: (view: View) => void;
  value: View;
}) => {
  const select = useCallback(() => onSelect(value), [onSelect, value]);

  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 font-medium text-sm transition-[color,box-shadow] focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={select}
      type="button"
    >
      <Icon className="size-4 shrink-0" />
      {label}
      {count !== undefined && count > 0 ? (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
};

/**
 * The whole brain on one screen: the conversation as the main pane, and a
 * memory rail beside it for what goes in (Capture), what awaits judgment
 * (Review) and who the brain knows (People). On small screens the rail and the
 * conversation share the viewport, toggled by the strip on top; the chat stays
 * mounted throughout so the conversation survives tab hopping.
 */
export const BrainWorkspace = ({
  ask,
  capture,
  openReviewCount,
  people,
  review,
}: BrainWorkspaceProperties) => {
  const [view, setView] = useState<View>("ask");
  // The rail is always visible on desktop, where "ask" isn't a tab — fall
  // back to whatever needs the user: the review queue when it has entries.
  const defaultMemory: MemoryTab = openReviewCount > 0 ? "review" : "capture";
  const memory: MemoryTab = view === "ask" ? defaultMemory : view;

  const panes: { key: MemoryTab; node: ReactNode }[] = [
    { key: "capture", node: capture },
    { key: "review", node: review },
    { key: "people", node: people },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
      <div className="flex h-9 items-center rounded-lg bg-muted p-[3px] lg:hidden">
        <SegmentButton
          active={view === "ask"}
          icon={BrainIcon}
          label="Ask"
          onSelect={setView}
          value="ask"
        />
        {MEMORY_TABS.map((tab) => (
          <SegmentButton
            active={view === tab.key}
            count={tab.key === "review" ? openReviewCount : undefined}
            icon={tab.icon}
            key={tab.key}
            label={tab.label}
            onSelect={setView}
            value={tab.key}
          />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 gap-6">
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col",
            view === "ask" ? "flex" : "hidden lg:flex"
          )}
        >
          {ask}
        </section>
        <aside
          className={cn(
            "min-h-0 w-full flex-col gap-4 lg:w-[380px] lg:shrink-0 lg:border-l lg:pl-6",
            view === "ask" ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="hidden h-9 items-center rounded-lg bg-muted p-[3px] lg:flex">
            {MEMORY_TABS.map((tab) => (
              <SegmentButton
                active={memory === tab.key}
                count={tab.key === "review" ? openReviewCount : undefined}
                icon={tab.icon}
                key={tab.key}
                label={tab.label}
                onSelect={setView}
                value={tab.key}
              />
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panes.map((pane) => (
              <div
                className={memory === pane.key ? "block" : "hidden"}
                key={pane.key}
              >
                {pane.node}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
