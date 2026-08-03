"use server";

import { auth, listOrganizationMembers } from "@repo/auth/server";
import Fuse from "fuse.js";

export const searchUsers = async (
  query: string
): Promise<
  | {
      data: string[];
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

    const fuse = new Fuse(members, {
      keys: ["name"],
      minMatchCharLength: 1,
      threshold: 0.3,
    });

    const results = fuse.search(query);
    const data = results.map((result) => result.item.userId);

    return { data };
  } catch (error) {
    return { error };
  }
};
