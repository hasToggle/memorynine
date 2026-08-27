"use client";

import type { Receipt } from "@repo/knowledge";
import { useCallback, useRef, useState } from "react";
import { getReceipts } from "@/app/actions/knowledge/get-receipts";
import type { CitationRef } from "@/lib/citation";

// One receipt cache for the whole conversation. Fetched on first click rather
// than with the answer: the provenance a receipt shows is far larger than the
// answer itself, and most citations are never opened.

// A lookup that returned nothing, or threw, has to land somewhere a reader
// can see rather than silently reverting to "no panel at all" — that reads as
// "click did nothing" rather than "this failed." "failed" is a distinct
// sentinel from a missing key precisely so ReceiptPanel can say so, and from
// "loading" so a later click retries instead of being treated as already
// in flight.
export type ReceiptEntry = Receipt | "failed" | "loading";

export const useReceipts = () => {
  const [byId, setById] = useState<Record<string, ReceiptEntry>>({});

  // setState updater functions must stay pure — React may invoke one more
  // than once per commit — so the "already loading/loaded" guard and the
  // fetch itself live here in the callback body, not nested inside an
  // updater. A ref mirrors the latest state so the guard always reads
  // current data despite `load` being a stable, empty-deps callback.
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  const load = useCallback((reference: CitationRef) => {
    const current = byIdRef.current[reference.id];
    // Skip only while a fetch is already in flight or already succeeded.
    // "failed" falls through so the next click retries.
    if (current && current !== "failed") {
      return;
    }
    setById((latest) => ({ ...latest, [reference.id]: "loading" }));
    getReceipts({
      factIds: reference.kind === "fact" ? [reference.id] : [],
      sourceIds: reference.kind === "source" ? [reference.id] : [],
    })
      .then((receipts) => {
        setById((latest) => {
          const next = { ...latest };
          for (const receipt of receipts) {
            next[receipt.id] = receipt;
          }
          if (!receipts.some((receipt) => receipt.id === reference.id)) {
            next[reference.id] = "failed";
          }
          return next;
        });
      })
      .catch(() => {
        setById((latest) => ({ ...latest, [reference.id]: "failed" }));
      });
  }, []);

  return { load, receipts: byId };
};
