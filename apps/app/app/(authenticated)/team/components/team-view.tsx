"use client";

import { authClient } from "@repo/auth/client";
import { emailDomain, PUBLIC_EMAIL_DOMAINS } from "@repo/auth/join-policy";
import type { TeamOverview } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useState, useTransition } from "react";
import { saveAllowedDomains } from "@/app/actions/team/allowed-domains";

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

const InviteForm = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const changeEmail = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value),
    []
  );

  const invite = useCallback(() => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const { error: inviteError } = await authClient.organization.inviteMember(
        {
          email: email.trim(),
          resend: true,
          role: role as "admin" | "member",
        }
      );
      if (inviteError) {
        setError(inviteError.message ?? "Could not send the invitation.");
        return;
      }
      setEmail("");
      setMessage("Invitation sent.");
      router.refresh();
    });
  }, [email, role, router]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          onChange={changeEmail}
          placeholder="colleague@company.com"
          type="email"
          value={email}
        />
        <Select onValueChange={setRole} value={role}>
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button
          disabled={isPending || email.trim().length === 0}
          onClick={invite}
        >
          {isPending ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {message ? (
        <p className="text-muted-foreground text-xs">{message}</p>
      ) : null}
    </div>
  );
};

const PendingInvitationRow = ({
  invitation,
}: {
  invitation: TeamOverview["invitations"][number];
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const cancel = useCallback(() => {
    startTransition(async () => {
      await authClient.organization.cancelInvitation({
        invitationId: invitation.id,
      });
      router.refresh();
    });
  }, [invitation.id, router]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm">{invitation.email}</span>
        <Badge variant="outline">{invitation.role}</Badge>
      </div>
      <Button disabled={isPending} onClick={cancel} size="sm" variant="outline">
        {isPending ? "Cancelling…" : "Cancel"}
      </Button>
    </div>
  );
};

const AllowedDomainsEditor = ({
  domains,
  sessionEmail,
}: {
  domains: string[];
  sessionEmail: string;
}) => {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ownDomain = emailDomain(sessionEmail);

  const changeDraft = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    []
  );

  const save = useCallback(
    (next: string[]) => {
      startTransition(async () => {
        setError(null);
        const result = await saveAllowedDomains(next);
        if (result.error) {
          setError(result.error);
          return;
        }
        setDraft("");
        router.refresh();
      });
    },
    [router]
  );

  const add = useCallback(() => {
    const domain = draft.trim().toLowerCase();
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
      setError("Public mail providers can't be allowed.");
      return;
    }
    save([...domains, domain]);
  }, [domains, draft, save]);

  const remove = useCallback(
    (domain: string) => save(domains.filter((entry) => entry !== domain)),
    [domains, save]
  );

  return (
    <div className="flex flex-col gap-2">
      {domains.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <DomainChip
              disabled={isPending}
              domain={domain}
              key={domain}
              onRemove={remove}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No domains allowed yet — colleagues can only get in by invitation.
        </p>
      )}
      <div className="flex gap-2">
        <Input
          onChange={changeDraft}
          placeholder={ownDomain ?? "company.com"}
          value={draft}
        />
        <Button
          disabled={isPending || draft.trim().length === 0}
          onClick={add}
          variant="outline"
        >
          {isPending ? "Saving…" : "Allow domain"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
};

const DomainChip = ({
  disabled,
  domain,
  onRemove,
}: {
  disabled: boolean;
  domain: string;
  onRemove: (domain: string) => void;
}) => {
  const remove = useCallback(() => onRemove(domain), [domain, onRemove]);
  return (
    <Badge className="gap-1 pr-1" variant="secondary">
      {domain}
      <button
        aria-label={`Remove ${domain}`}
        className="rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
        disabled={disabled}
        onClick={remove}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </Badge>
  );
};

export const TeamView = ({
  overview,
  sessionEmail,
}: {
  overview: TeamOverview;
  sessionEmail: string;
}) => (
  <div className="flex flex-col gap-4">
    <Section
      description={`Everyone here shares ${overview.organizationName}'s brain — its facts, review queue, and people.`}
      title={`Members (${overview.members.length})`}
    >
      <div className="flex flex-col gap-2">
        {overview.members.map((member) => (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
            key={member.userId}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium text-sm">
                {member.name}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {member.email}
              </span>
            </div>
            <Badge variant={member.role === "member" ? "outline" : "secondary"}>
              {member.role}
            </Badge>
          </div>
        ))}
      </div>
    </Section>

    {overview.isAdmin ? (
      <>
        <Section
          description="They'll get an email and can accept after verifying their address."
          title="Invite someone"
        >
          <InviteForm />
          {overview.invitations.length > 0 ? (
            <div className="flex flex-col gap-2">
              {overview.invitations.map((invitation) => (
                <PendingInvitationRow
                  invitation={invitation}
                  key={invitation.id}
                />
              ))}
            </div>
          ) : null}
        </Section>

        <Section
          description="Anyone with a verified email on an allowed domain can join on their own — no invitation needed. You can only allow your own email domain, and public mail providers are excluded."
          title="Allowed email domains"
        >
          <AllowedDomainsEditor
            domains={overview.allowedDomains}
            sessionEmail={sessionEmail}
          />
        </Section>
      </>
    ) : null}
  </div>
);
