"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * False on the server and on the first client render alike.
 *
 * The better-auth stores are nanostores that resolve as soon as their fetch
 * lands, which can happen before React hydrates. Gating on this keeps the
 * first client render byte-identical to the SSR output instead of swapping a
 * loading placeholder for real data mid-hydration.
 */
export const useIsMounted = (): boolean => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return isMounted;
};

/** Closes an open popover on an outside pointer press or on Escape. */
export const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: () => void
): void => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onDismiss();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onDismiss, ref]);
};
