"use client";

import { cn } from "@repo/design-system/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";

/**
 * The signature element: the answer you get two minutes before a call, with
 * receipts you can open.
 *
 * The labels are deliberately not the ones the database uses. Nobody standing
 * outside a meeting room cares about extraction runs — they care who said it,
 * whether anyone checked, and whether it is safe to repeat. The ochre receipt
 * stops short on purpose: it is something a colleague said yesterday that
 * nobody has confirmed, and the card says so before you quote it.
 */

interface ReceiptRow {
  readonly detail: string;
  readonly label: string;
}

interface Receipt {
  readonly id: string;
  readonly kind: "checked" | "unchecked";
  readonly quote: string;
  readonly rows: readonly ReceiptRow[];
  readonly verdict: string;
}

const RECEIPTS: readonly Receipt[] = [
  {
    id: "6a70f2",
    kind: "checked",
    quote:
      "„Die überarbeitete Fassung brauchen sie bis Ende August, sonst rutscht das Ganze ins nächste Quartal.“",
    rows: [
      { detail: "Their procurement lead, in writing", label: "Who said it" },
      { detail: "A forwarded mail thread, 1 July", label: "Where from" },
      { detail: "Eric, the same morning", label: "Who checked it" },
      { detail: "Nothing since has contradicted it", label: "Still good?" },
    ],
    verdict: "Safe to say out loud.",
  },
  {
    id: "8c14b9",
    kind: "checked",
    quote:
      "„…und bitte nichts vor zehn, die Anna macht ihre Entscheidungen am liebsten morgens, aber nicht früh.“",
    rows: [
      { detail: "Anna, on the call — Eric was there", label: "Who said it" },
      {
        detail: "Eric's memo on the drive back, 13 March",
        label: "Where from",
      },
      {
        detail: "Eric, next morning. He fixed the wording first.",
        label: "Who checked it",
      },
      { detail: "Held up for five months", label: "Still good?" },
    ],
    verdict: "Safe to say out loud.",
  },
  {
    id: "4d09e1",
    kind: "unchecked",
    quote:
      "„…klang so, als würde das Budget ins erste Quartal rutschen — muss ich aber noch bestätigen lassen.“",
    rows: [
      { detail: "Marie, reporting what she picked up", label: "Who said it" },
      { detail: "Her memo yesterday, 17:22", label: "Where from" },
      {
        detail: "Nobody yet — it is in today's queue",
        label: "Who checked it",
      },
      { detail: "It disagrees with the July mail", label: "Careful" },
    ],
    verdict: "Worth knowing. Don't quote it to them yet.",
  },
];

const findReceipt = (id: string) =>
  RECEIPTS.find((receipt) => receipt.id === id) ?? RECEIPTS[0];

const ReceiptChip = ({
  onSelect,
  receipt,
  selected,
}: {
  onSelect: (id: string) => void;
  receipt: Receipt;
  selected: boolean;
}) => {
  const select = useCallback(
    () => onSelect(receipt.id),
    [onSelect, receipt.id]
  );
  const checked = receipt.kind === "checked";

  return (
    <button
      aria-expanded={selected}
      className={cn(
        // JSX drops the newline between the preceding word and this tag, so
        // the chip carries its own leading space — and none on the right, so
        // the full stop after a receipt sits where a full stop belongs.
        "ml-1 inline-flex translate-y-[-0.06em] items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 align-baseline font-medium font-mono text-[0.6875rem] leading-none transition-colors",
        "focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2",
        checked
          ? "bg-mn-stamp-tint text-mn-stamp hover:bg-mn-stamp hover:text-mn-paper"
          : "bg-mn-ochre-tint text-mn-ochre hover:bg-mn-ochre hover:text-mn-paper",
        selected &&
          (checked ? "bg-mn-stamp text-mn-paper" : "bg-mn-ochre text-mn-paper")
      )}
      onClick={select}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-[1px]",
          checked ? "bg-current" : "border border-current"
        )}
      />
      {receipt.id}
      <span className="sr-only">
        {checked
          ? " — checked by someone, open the receipt"
          : " — nobody has checked this, open the receipt"}
      </span>
    </button>
  );
};

export function Trace() {
  const [selectedId, setSelectedId] = useState("8c14b9");
  const reduceMotion = useReducedMotion();
  const receipt = findReceipt(selectedId);
  const checked = receipt.kind === "checked";

  return (
    <figure className="overflow-hidden rounded-lg border border-mn-rule bg-mn-raised shadow-[0_1px_0_var(--color-mn-rule),0_18px_50px_-32px_rgb(20_22_26/0.45)]">
      <figcaption className="flex items-center justify-between border-mn-rule border-b px-5 py-3 font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.18em]">
        <span>09:58</span>
        <span>Two minutes before the call</span>
      </figcaption>

      <div className="px-5 pt-5 pb-4">
        <p className="font-bold font-cabinet text-[1.375rem] text-mn-ink leading-[1.2] tracking-[-0.02em]">
          What do I need to know before I talk to Nordwind?
        </p>
        <p className="mt-4 text-[0.9375rem] text-mn-ink-soft leading-[1.75]">
          They need the revised quote by the end of August, or it slips a
          quarter
          <ReceiptChip
            onSelect={setSelectedId}
            receipt={RECEIPTS[0]}
            selected={selectedId === "6a70f2"}
          />
          . Anna Bergmann signs it off, and she only decides things late morning
          <ReceiptChip
            onSelect={setSelectedId}
            receipt={RECEIPTS[1]}
            selected={selectedId === "8c14b9"}
          />
          . One thing to be careful with: Marie heard yesterday that the budget
          may move to Q1
          <ReceiptChip
            onSelect={setSelectedId}
            receipt={RECEIPTS[2]}
            selected={selectedId === "4d09e1"}
          />
          {" — nobody has checked that yet."}
        </p>
      </div>

      <div className="border-mn-rule border-t bg-mn-paper/70 px-5 py-4">
        <p className="font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.18em]">
          Receipt {receipt.id}
        </p>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: reduceMotion ? 1 : 0 }}
            key={receipt.id}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <ol className="mt-3.5 space-y-0">
              {receipt.rows.map((row, index) => (
                <li className="relative flex gap-3 pb-3.5 pl-4" key={row.label}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[0.3rem] left-0 size-1.5 rounded-full",
                      checked ? "bg-mn-stamp" : "bg-mn-ochre"
                    )}
                  />
                  {index < receipt.rows.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-[0.7rem] bottom-0 left-[0.1875rem] w-px bg-mn-rule"
                    />
                  ) : null}
                  <span className="w-[6.75rem] shrink-0 font-medium font-mono text-[0.6875rem] text-mn-graphite uppercase leading-[1.5] tracking-[0.05em]">
                    {row.label}
                  </span>
                  <span className="text-[0.8125rem] text-mn-ink-soft leading-[1.5]">
                    {row.detail}
                  </span>
                </li>
              ))}
            </ol>

            <blockquote
              className={cn(
                "border-l-2 py-1 pl-3.5 text-[0.875rem] text-mn-ink leading-[1.6]",
                checked ? "border-mn-stamp" : "border-mn-ochre"
              )}
              lang="de"
            >
              {receipt.quote}
            </blockquote>

            <p
              className={cn(
                "mt-3.5 font-medium font-mono text-[0.6875rem] leading-[1.5]",
                checked ? "text-mn-stamp" : "text-mn-ochre"
              )}
            >
              {receipt.verdict}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </figure>
  );
}
