"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
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

type SignUpResponse = SignUpSuccess | SignUpError;

export function Digest() {
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const handleSignUp = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const emailInput = form.elements.namedItem("email") as HTMLInputElement;
      setStatus("loading");

      try {
        const res = await fetch("/api/confirm", {
          body: JSON.stringify({ email: emailInput.value }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data: SignUpResponse = await res.json();

        if ("error" in data) {
          toast.error(data.error.message);
        } else {
          toast.success("Check your inbox — we sent you a confirmation.");
          form.reset();
        }
      } catch {
        toast.error("A network error occurred. Please try again.");
      } finally {
        setStatus("idle");
      }
    },
    []
  );

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row"
      onSubmit={handleSignUp}
    >
      <div className="flex-1">
        <Label className="sr-only" htmlFor="digest-email">
          Email address
        </Label>
        <Input
          autoComplete="email"
          className="h-11"
          id="digest-email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </div>
      <Button
        className="h-11 px-6"
        disabled={status === "loading"}
        type="submit"
      >
        {status === "loading" ? "Sending…" : "Add me"}
      </Button>
    </form>
  );
}
