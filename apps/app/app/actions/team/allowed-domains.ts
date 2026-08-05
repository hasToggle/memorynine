"use server";

import { updateAllowedDomains } from "@repo/auth/server";

export const saveAllowedDomains = async (
  domains: string[]
): Promise<{ error?: string }> => updateAllowedDomains(domains);
