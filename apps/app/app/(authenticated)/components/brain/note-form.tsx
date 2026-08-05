"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { type ChangeEvent, useCallback, useState, useTransition } from "react";
import { createManualSource } from "@/app/actions/knowledge/create-source";

export const NoteForm = ({ onCaptured }: { onCaptured: () => void }) => {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const changeText = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value),
    []
  );

  const submit = useCallback(() => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createManualSource(text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setText("");
      setMessage(
        "Saved. Extraction proposes knowledge within a few minutes — review it under Review."
      );
      onCaptured();
    });
  }, [onCaptured, text]);

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        onChange={changeText}
        placeholder="Notiz nach dem Telefonat mit …"
        rows={6}
        value={text}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {message ? (
        <p className="text-muted-foreground text-sm">{message}</p>
      ) : null}
      <div>
        <Button
          disabled={isPending || text.trim().length === 0}
          onClick={submit}
          type="button"
        >
          {isPending ? "Saving…" : "Save note"}
        </Button>
      </div>
    </div>
  );
};
