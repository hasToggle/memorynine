"use client";

import {
  NotificationFeedPopover,
  NotificationIconButton,
} from "@knocklabs/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { keys } from "../keys";

// Required CSS import, unless you're overriding the styling
import "@knocklabs/react/dist/index.css";
import "../styles.css";

export const NotificationsTrigger = () => {
  const [isVisible, setIsVisible] = useState(false);
  // The popover anchors to the button, so it can only mount on the pass after
  // the button itself — reading notifButtonRef.current during render never
  // sees it.
  const [isButtonMounted, setIsButtonMounted] = useState(false);
  const notifButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsButtonMounted(true);
  }, []);

  const handleToggle = useCallback(() => {
    setIsVisible((visible) => !visible);
  }, []);

  const handleClose = useCallback((event: Event) => {
    if (event.target === notifButtonRef.current) {
      return;
    }

    setIsVisible(false);
  }, []);

  if (!keys().NEXT_PUBLIC_KNOCK_API_KEY) {
    return null;
  }

  return (
    <>
      <NotificationIconButton onClick={handleToggle} ref={notifButtonRef} />
      {isButtonMounted ? (
        <NotificationFeedPopover
          buttonRef={notifButtonRef as RefObject<HTMLElement>}
          isVisible={isVisible}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
};
