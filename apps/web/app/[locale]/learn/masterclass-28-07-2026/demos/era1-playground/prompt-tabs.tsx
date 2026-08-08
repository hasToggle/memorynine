"use client";

import { cn } from "@repo/design-system/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent } from "react";
import { PROMPTS } from "./completions";

const FADE = { duration: 0.25 } as const;

interface PromptTabsProps {
  activeId: string;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  showSecond: boolean;
}

/**
 * Folder tabs on a recessed band. The loaded prompt carries the output panel's
 * fill and runs to the band's bottom edge, so it merges into the code beneath
 * and reads as the front of one object; the unloaded prompt is bare text on the
 * band behind it.
 *
 * Only the loaded prompt has a shape. An earlier pass gave the shape to the
 * unloaded one instead — a darker chip, on the theory that a recess reads as
 * withdrawn. It doesn't: a filled form reads as the chosen one whichever
 * direction it's shaded, so the dead prompt looked live. The darkness belongs
 * to the whole band, where it's read as a plane rather than a selection.
 *
 * The band is also why there's no stripe of bare page above the tabs — they
 * stretch to its full height, and it is a sibling of the panel's own tone
 * rather than the near-black page behind everything.
 */
export function PromptTabs({
  activeId,
  onSelect,
  showSecond,
}: PromptTabsProps) {
  const visible = showSecond ? PROMPTS : PROMPTS.slice(0, 1);
  // The band carries no horizontal padding: the first tab has to reach the
  // panel's own edge, or a sliver of band shows beside it and reads as a seam.
  // Each tab's px-4 therefore both indents the label to match the code's p-4
  // and supplies the inset the band no longer does.
  return (
    <div className="flex h-10 items-stretch gap-1 bg-foreground/[0.04] dark:bg-black/30">
      <AnimatePresence initial={false}>
        {visible.map((prompt) => {
          const active = prompt.id === activeId;
          return (
            <motion.button
              animate={{ opacity: 1 }}
              aria-pressed={active}
              className={cn(
                "whitespace-nowrap rounded-t-md px-4 font-mono text-xs transition-colors sm:text-sm",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-prompt={prompt.id}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={prompt.id}
              onClick={onSelect}
              transition={FADE}
              type="button"
            >
              {prompt.label}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
