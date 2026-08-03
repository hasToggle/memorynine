"use server";

import { auth, listOrganizationMembers } from "@repo/auth/server";

const colors = [
  "var(--color-red-500)",
  "var(--color-orange-500)",
  "var(--color-amber-500)",
  "var(--color-yellow-500)",
  "var(--color-lime-500)",
  "var(--color-green-500)",
  "var(--color-emerald-500)",
  "var(--color-teal-500)",
  "var(--color-cyan-500)",
  "var(--color-sky-500)",
  "var(--color-blue-500)",
  "var(--color-indigo-500)",
  "var(--color-violet-500)",
  "var(--color-purple-500)",
  "var(--color-fuchsia-500)",
  "var(--color-pink-500)",
  "var(--color-rose-500)",
];

export const getUsers = async (
  userIds: string[]
): Promise<
  | {
      data: Liveblocks["UserMeta"]["info"][];
    }
  | {
      error: unknown;
    }
> => {
  try {
    const { orgId } = await auth();

    if (!orgId) {
      throw new Error("Not logged in");
    }

    const members = await listOrganizationMembers(orgId);

    const data: Liveblocks["UserMeta"]["info"][] = members
      .filter((member) => userIds.includes(member.userId))
      .map((member) => ({
        color: colors[Math.floor(Math.random() * colors.length)],
        name: member.name,
        picture: member.imageUrl,
      }));

    return { data };
  } catch (error) {
    return { error };
  }
};
