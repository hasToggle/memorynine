"use client";

import { LogOut } from "lucide-react";
import { useCallback, useState } from "react";
import { authClient } from "../client";

interface UserButtonProps {
  /** Accepted for Clerk compatibility; ignored. */
  appearance?: unknown;
  showName?: boolean;
}

export const UserButton = ({ showName = false }: UserButtonProps) => {
  const { data: session, isPending } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setIsOpen((previous) => !previous);
  }, []);

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    // Full navigation so the server layout picks up the cleared session.
    window.location.href = "/sign-in";
  }, []);

  if (isPending) {
    return (
      <div
        className={`h-8 animate-pulse rounded-full bg-muted ${
          showName ? "w-32" : "w-8"
        }`}
      />
    );
  }

  if (!session) {
    return null;
  }

  const { user } = session;
  const displayName = user.name || user.email;
  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-md p-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={handleToggle}
        type="button"
      >
        {user.image ? (
          // biome-ignore lint/performance/noImgElement: shared package avoids next/image to stay framework-light
          <img
            alt={displayName}
            className="size-8 shrink-0 rounded-full object-cover"
            height={32}
            src={user.image}
            width={32}
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-sm">
            {initial}
          </span>
        )}
        {showName ? (
          <span className="min-w-0 flex-1 truncate text-left">
            {displayName}
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="px-2 py-1.5">
            <p className="truncate font-medium text-sm">{displayName}</p>
            <p className="truncate text-muted-foreground text-xs">
              {user.email}
            </p>
          </div>
          <div className="my-1 border-border border-t" />
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut className="size-4 shrink-0 text-muted-foreground" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
};
