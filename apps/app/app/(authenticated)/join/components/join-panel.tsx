"use client";

import { authClient } from "@repo/auth/client";
import type {
  JoinableOrganization,
  PendingInvitation,
} from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { MailCheckIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useState, useTransition } from "react";
import { joinByDomain } from "@/app/actions/team/join";

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

const Section = ({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) => (
  <section className="flex flex-col gap-3 rounded-xl border p-4">
    <div className="flex flex-col gap-1">
      <h2 className="font-medium text-sm">{title}</h2>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
    {children}
  </section>
);

const VerifyEmailPrompt = ({ email }: { email: string }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resend = useCallback(() => {
    startTransition(async () => {
      const { error } = await authClient.sendVerificationEmail({
        callbackURL: "/join",
        email,
      });
      setMessage(
        error
          ? (error.message ?? "Could not send the email.")
          : "Verification email sent — check your inbox."
      );
    });
  }, [email]);

  return (
    <Section
      description={`We sent a verification link to ${email}. Joining a team requires a verified address — it's what proves you belong to your company's domain.`}
      title="Verify your email"
    >
      <div className="flex items-center gap-3">
        <Button disabled={isPending} onClick={resend} variant="outline">
          <MailCheckIcon className="size-4" />
          {isPending ? "Sending…" : "Resend verification email"}
        </Button>
        {message ? (
          <p className="text-muted-foreground text-xs">{message}</p>
        ) : null}
      </div>
    </Section>
  );
};

const InvitationRow = ({
  disabled,
  invitation,
  onAccept,
}: {
  disabled: boolean;
  invitation: PendingInvitation;
  onAccept: (invitationId: string) => void;
}) => {
  const accept = useCallback(
    () => onAccept(invitation.id),
    [invitation.id, onAccept]
  );
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-sm">
          {invitation.organizationName}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {invitation.inviterEmail
            ? `invited by ${invitation.inviterEmail} · `
            : ""}
          as {invitation.role}
        </span>
      </div>
      <Button disabled={disabled} onClick={accept} size="sm">
        Accept
      </Button>
    </div>
  );
};

const JoinableRow = ({
  disabled,
  onJoin,
  org,
}: {
  disabled: boolean;
  onJoin: (organizationId: string) => void;
  org: JoinableOrganization;
}) => {
  const join = useCallback(() => onJoin(org.id), [onJoin, org.id]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-sm">{org.name}</span>
        <Badge variant="secondary">
          {org.memberCount} member{org.memberCount === 1 ? "" : "s"}
        </Badge>
      </div>
      <Button disabled={disabled} onClick={join} size="sm">
        Join
      </Button>
    </div>
  );
};

const CreateOrganizationForm = () => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const changeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    []
  );

  const create = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const { data, error: createError } = await authClient.organization.create(
        { name, slug: createSlug(name) }
      );
      if (createError || !data) {
        setError(createError?.message ?? "Could not create the organization.");
        return;
      }
      await authClient.organization.setActive({ organizationId: data.id });
      window.location.href = "/";
    });
  }, [name]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          onChange={changeName}
          placeholder="Organization name"
          value={name}
        />
        <Button
          disabled={isPending || name.trim().length === 0}
          onClick={create}
        >
          {isPending ? "Creating…" : "Create"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
};

export const JoinPanel = ({
  email,
  emailVerified,
  hasActiveOrganization,
  invitations,
  joinable,
}: {
  email: string;
  emailVerified: boolean;
  hasActiveOrganization: boolean;
  invitations: PendingInvitation[];
  joinable: JoinableOrganization[];
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accept = useCallback((invitationId: string) => {
    startTransition(async () => {
      setError(null);
      const { data, error: acceptError } =
        await authClient.organization.acceptInvitation({ invitationId });
      if (acceptError || !data) {
        setError(acceptError?.message ?? "Could not accept the invitation.");
        return;
      }
      await authClient.organization.setActive({
        organizationId: data.invitation.organizationId,
      });
      window.location.href = "/";
    });
  }, []);

  const join = useCallback((organizationId: string) => {
    startTransition(async () => {
      setError(null);
      const result = await joinByDomain(organizationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      window.location.href = "/";
    });
  }, []);

  if (!emailVerified) {
    return (
      <>
        <VerifyEmailPrompt email={email} />
        <Section
          description="You can also start fresh — a new organization doesn't need a verified email."
          title="Create a new organization"
        >
          <CreateOrganizationForm />
        </Section>
      </>
    );
  }

  return (
    <>
      {invitations.length > 0 ? (
        <Section
          description="You've been invited to these organizations."
          title="Invitations"
        >
          <div className="flex flex-col gap-2">
            {invitations.map((invitation) => (
              <InvitationRow
                disabled={isPending}
                invitation={invitation}
                key={invitation.id}
                onAccept={accept}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {joinable.length > 0 ? (
        <Section
          description={`These organizations accept everyone with a verified @${email.slice(email.lastIndexOf("@") + 1)} address.`}
          title="Your team is already here"
        >
          <div className="flex flex-col gap-2">
            {joinable.map((org) => (
              <JoinableRow
                disabled={isPending}
                key={org.id}
                onJoin={join}
                org={org}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {invitations.length === 0 && joinable.length === 0 ? (
        <Section
          description="No invitations and no organization accepts your email domain yet. Ask a teammate to invite you or to allow your domain under Team, or start a new organization below."
          title="Nothing to join yet"
        >
          <p className="text-muted-foreground text-xs">
            Signed in as {email}
            {hasActiveOrganization
              ? " — you already belong to an organization."
              : ""}
          </p>
        </Section>
      ) : null}

      <Section
        description="Start fresh instead — you can always invite your team later."
        title="Create a new organization"
      >
        <CreateOrganizationForm />
      </Section>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </>
  );
};
