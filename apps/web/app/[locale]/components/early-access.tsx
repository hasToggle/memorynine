"use client";

import { toast } from "@repo/design-system/components/ui/sonner";
import { useCallback, useState } from "react";

interface SignUpSuccess {
  message: string;
}

interface SignUpError {
  error: {
    message: string;
    name: string;
  };
}

type SignUpResponse = SignUpError | SignUpSuccess;

export function EarlyAccess() {
  const [status, setStatus] = useState<"idle" | "sending">("idle");

  const handleSubmit = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const emailInput = form.elements.namedItem("email") as HTMLInputElement;
      setStatus("sending");

      try {
        const response = await fetch("/api/confirm", {
          body: JSON.stringify({ email: emailInput.value }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data: SignUpResponse = await response.json();

        if ("error" in data) {
          toast.error(data.error.message);
        } else {
          toast.success("Check your inbox and confirm the address.");
          form.reset();
        }
      } catch {
        toast.error("That request didn't reach us. Try again.");
      } finally {
        setStatus("idle");
      }
    },
    []
  );

  return (
    <form
      className="flex w-full max-w-lg flex-col gap-3 sm:flex-row"
      onSubmit={handleSubmit}
    >
      <label className="flex-1" htmlFor="access-email">
        <span className="sr-only">Work email</span>
        <input
          autoComplete="email"
          className="h-11 w-full rounded-[5px] border border-mn-band-ink/45 bg-transparent px-3.5 text-[0.9375rem] text-mn-band-ink placeholder:text-mn-band-ink/55 focus-visible:border-mn-band-ink focus-visible:outline-2 focus-visible:outline-mn-band-ink focus-visible:outline-offset-2"
          id="access-email"
          name="email"
          placeholder="you@yourcompany.de"
          required
          type="email"
        />
      </label>
      <button
        className="h-11 shrink-0 rounded-[5px] bg-mn-band-ink px-5 font-medium text-[0.9375rem] text-mn-band transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-mn-band-ink focus-visible:outline-offset-2 disabled:opacity-60"
        disabled={status === "sending"}
        type="submit"
      >
        {status === "sending" ? "Sending…" : "Book the half hour"}
      </button>
    </form>
  );
}
