import { GROUNDING_AMENDMENT, PROMPT, RETRIEVED_DOCS } from "./paragraph-data";

interface PromptInputProps {
  amended: boolean;
}

export function PromptInput({ amended }: PromptInputProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 px-4 py-3 font-mono text-sm sm:px-5 sm:py-4 sm:text-base">
      <p className="text-foreground/85">
        <span
          aria-hidden="true"
          className="mr-2 select-none text-foreground/40"
        >
          {">"}
        </span>
        {PROMPT}
      </p>

      {amended ? (
        <>
          <p className="text-ht-cyan-700 dark:text-ht-cyan-300">
            <span aria-hidden="true" className="mr-2 select-none">
              {"↳"}
            </span>
            {GROUNDING_AMENDMENT}
          </p>
          <p className="text-foreground/65 text-xs sm:text-sm">
            <span aria-hidden="true">
              <span className="mr-2 select-none">{"↳"}</span>
              grounded in {RETRIEVED_DOCS.length} docs.
            </span>
          </p>
        </>
      ) : null}
    </div>
  );
}
