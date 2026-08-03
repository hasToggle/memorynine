"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useId, useState } from "react";
import { authClient } from "../client";

export const SignIn = () => {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setEmail(event.target.value);
    },
    []
  );

  const handlePasswordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPassword(event.target.value);
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsPending(true);

      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message ?? "Unable to sign in.");
        setIsPending(false);
        return;
      }

      // Full navigation so the server layout picks up the new session cookie.
      window.location.href = "/";
    },
    [email, password]
  );

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
      <h1 className="font-semibold text-card-foreground text-lg">Sign in</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Welcome back. Enter your credentials to continue.
      </p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label
            className="font-medium text-foreground text-sm"
            htmlFor={emailId}
          >
            Email
          </label>
          <input
            autoComplete="email"
            className="h-9 rounded-md border border-input bg-background px-3 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            id={emailId}
            name="email"
            onChange={handleEmailChange}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            className="font-medium text-foreground text-sm"
            htmlFor={passwordId}
          >
            Password
          </label>
          <input
            autoComplete="current-password"
            className="h-9 rounded-md border border-input bg-background px-3 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            id={passwordId}
            name="password"
            onChange={handlePasswordChange}
            required
            type="password"
            value={password}
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <button
          className="h-9 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-muted-foreground text-sm">
        No account?{" "}
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href="/sign-up"
        >
          Sign up
        </a>
      </p>
    </div>
  );
};
