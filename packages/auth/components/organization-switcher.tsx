"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
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

interface OrganizationSwitcherProps {
  afterSelectOrganizationUrl?: string;
  /** Accepted for Clerk compatibility; personal accounts are not supported. */
  hidePersonal?: boolean;
}

interface OrganizationItemProps {
  isActive: boolean;
  name: string;
  onSelect: (organizationId: string) => void;
  organizationId: string;
}

const OrganizationItem = ({
  isActive,
  name,
  onSelect,
  organizationId,
}: OrganizationItemProps) => {
  const handleClick = useCallback(() => {
    onSelect(organizationId);
  }, [onSelect, organizationId]);

  return (
    <button
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      onClick={handleClick}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {isActive ? <Check className="size-4 shrink-0" /> : null}
    </button>
  );
};

export const OrganizationSwitcher = ({
  afterSelectOrganizationUrl,
}: OrganizationSwitcherProps) => {
  const newOrganizationId = useId();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleToggle = useCallback(() => {
    setIsOpen((previous) => !previous);
  }, []);

  const handleNewOrganizationNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setNewOrganizationName(event.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    async (organizationId: string) => {
      setError(null);
      setIsPending(true);

      const { error: setActiveError } = await authClient.organization.setActive(
        {
          organizationId,
        }
      );

      if (setActiveError) {
        setError(
          setActiveError.message ?? "Unable to switch the organization."
        );
        setIsPending(false);
        return;
      }

      setIsOpen(false);
      // Full navigation so the server layout picks up the change.
      window.location.href = afterSelectOrganizationUrl ?? "/";
    },
    [afterSelectOrganizationUrl]
  );

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsPending(true);

      const { data: organization, error: createError } =
        await authClient.organization.create({
          name: newOrganizationName,
          slug: createSlug(newOrganizationName),
        });

      if (createError || !organization) {
        setError(createError?.message ?? "Unable to create the organization.");
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

      setIsOpen(false);
      // Full navigation so the server layout picks up the change.
      window.location.href = afterSelectOrganizationUrl ?? "/";
    },
    [afterSelectOrganizationUrl, newOrganizationName]
  );

  return (
    <div className="relative w-full">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={handleToggle}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {activeOrganization?.name ?? "Select organization"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {isOpen ? (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="flex flex-col">
            {organizations?.length ? (
              organizations.map((organization) => (
                <OrganizationItem
                  isActive={organization.id === activeOrganization?.id}
                  key={organization.id}
                  name={organization.name}
                  onSelect={handleSelect}
                  organizationId={organization.id}
                />
              ))
            ) : (
              <p className="px-2 py-1.5 text-muted-foreground text-sm">
                No organizations yet.
              </p>
            )}
          </div>
          <form
            className="mt-1 flex flex-col gap-1.5 border-border border-t p-1 pt-2"
            onSubmit={handleCreate}
          >
            <label
              className="font-medium text-muted-foreground text-xs"
              htmlFor={newOrganizationId}
            >
              New organization
            </label>
            <div className="flex items-center gap-1.5">
              <input
                className="h-8 w-full min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                id={newOrganizationId}
                name="organization"
                onChange={handleNewOrganizationNameChange}
                placeholder="Acme Inc."
                required
                type="text"
                value={newOrganizationName}
              />
              <button
                aria-label="Create organization"
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                disabled={isPending}
                type="submit"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  );
};
