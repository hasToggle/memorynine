"use client";

import type { Receipt } from "@repo/knowledge";
import { useCallback, useRef, useState } from "react";
import { getReceipts } from "@/app/actions/knowledge/get-receipts";
import type { CitationRef } from "@/lib/citation";

// One receipt cache for the whole conversation. Fetched on first click rather
// than with the answer: the provenance a receipt shows is far larger than the
// answer itself, and most citations are never opened.

export const useReceipts = () => {
  const [byId, setById] = useState<Record<string, Receipt | "loading">>({});

  // setState updater functions must stay pure — React may invoke one more
  // than once per commit — so the "already loading/loaded" guard and the
  // fetch itself live here in the callback body, not nested inside an
  // updater. A ref mirrors the latest state so the guard always reads
  // current data despite `load` being a stable, empty-deps callback.
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  const load = useCallback((reference: CitationRef) => {
    if (byIdRef.current[reference.id]) {
      return;
    }
    setById((current) => ({ ...current, [reference.id]: "loading" }));
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
          // A lookup that returned nothing must not sit on "loading"
          // forever — drop it so a retry is possible.
          if (!receipts.some((receipt) => receipt.id === reference.id)) {
            delete next[reference.id];
          }
          return next;
        });
      })
      .catch(() => {
        setById((latest) => {
          const next = { ...latest };
          delete next[reference.id];
          return next;
        });
      });
  }, []);

  return { load, receipts: byId };
};
