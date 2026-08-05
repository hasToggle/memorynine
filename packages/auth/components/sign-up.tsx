"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useId, useState } from "react";
import { authClient } from "../client";

const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const EDGE_DASHES = /(^-+)|(-+$)/g;
const SLUG_SUFFIX_LENGTH = 6;
const SLUG_SUFFIX_RADIX = 36;

const createSlug = (name: string) => {
  const base = name
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "-")
    .replace(EDGE_DASHES, "");
  const suffix = Math.random()
    .toString(SLUG_SUFFIX_RADIX)
    .slice(2, 2 + SLUG_SUFFIX_LENGTH);

  return `${base || "org"}-${suffix}`;
};

type SignUpMode = "create" | "join";

export const SignUp = () => {
  const nameId = useId();
  const organizationId = useId();
  const emailId = useId();
  const passwordId = useId();
  const [mode, setMode] = useState<SignUpMode>("create");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const chooseCreate = useCallback(() => setMode("create"), []);
  const chooseJoin = useCallback(() => setMode("join"), []);

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setName(event.target.value);
    },
    []
  );

  const handleOrganizationNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setOrganizationName(event.target.value);
    },
    []
  );

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

      const { error: signUpError } = await authClient.signUp.email({
        email,
        name,
        password,
      });

      if (signUpError) {
        setError(signUpError.message ?? "Unable to create your account.");
        setIsPending(false);
        return;
      }

      if (mode === "join") {
        // No organization is created: /join offers pending invitations and
        // domain-matching organizations once the email is verified.
        window.location.href = "/join";
        return;
      }

      const { data: organization, error: organizationError } =
        await authClient.organization.create({
          name: organizationName,
          slug: createSlug(organizationName),
        });

      if (organizationError || !organization) {
        setError(
          organizationError?.message ?? "Unable to create the organization."
        );
        setIsPending(false);
        return;
      }

      const { error: setActiveError } = await authClient.organization.setActive(
        {
          organizationId: organization.id,
        }
      );

      if (setActiveError) {
        setError(
          setActiveError.message ?? "Unable to activate the organization."
        );
        setIsPending(false);
        return;
      }

      // Full navigation so the server layout picks up the new session cookie.
      window.location.href = "/";
    },
    [email, mode, name, organizationName, password]
  );

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
      <h1 className="font-semibold text-card-foreground text-lg">
        Create your account
      </h1>
      <p className="mt-1 text-muted-foreground text-sm">
        {mode === "create"
          ? "Set up your account and organization to get started."
          : "Create your account, then join your team's existing organization."}
      </p>
      <div className="mt-4 flex h-9 items-center rounded-lg bg-muted p-[3px]">
        <button
          aria-pressed={mode === "create"}
          className={`inline-flex h-full flex-1 items-center justify-center rounded-md px-2 font-medium text-sm transition-colors ${
            mode === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={chooseCreate}
          type="button"
        >
          New organization
        </button>
        <button
          aria-pressed={mode === "join"}
          className={`inline-flex h-full flex-1 items-center justify-center rounded-md px-2 font-medium text-sm transition-colors ${
            mode === "join"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={chooseJoin}
          type="button"
        >
          Join my team
        </button>
      </div>
      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label
            className="font-medium text-foreground text-sm"
            htmlFor={nameId}
          >
            Name
          </label>
          <input
            autoComplete="name"
            className="h-9 rounded-md border border-input bg-background px-3 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            id={nameId}
            name="name"
            onChange={handleNameChange}
            placeholder="Jane Doe"
            required
            type="text"
            value={name}
          />
        </div>
        {mode === "create" ? (
          <div className="flex flex-col gap-1.5">
            <label
              className="font-medium text-foreground text-sm"
              htmlFor={organizationId}
            >
              Organization name
            </label>
            <input
              autoComplete="organization"
              className="h-9 rounded-md border border-input bg-background px-3 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              id={organizationId}
              name="organization"
              onChange={handleOrganizationNameChange}
              placeholder="Acme Inc."
              required
              type="text"
              value={organizationName}
            />
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
            Use your work email — after verifying it you'll see your team's
            organization and any invitations waiting for you.
          </p>
        )}
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
            autoComplete="new-password"
            className="h-9 rounded-md border border-input bg-background px-3 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            id={passwordId}
            minLength={8}
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
          {isPending ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="mt-4 text-muted-foreground text-sm">
        Already have an account?{" "}
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href="/sign-in"
        >
          Sign in
        </a>
      </p>
    </div>
  );
};
