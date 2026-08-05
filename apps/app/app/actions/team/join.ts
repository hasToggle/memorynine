"use server";

import { joinOrganizationByEmailDomain } from "@repo/auth/server";

export const joinByDomain = async (
  organizationId: string
): Promise<{ error?: string }> => joinOrganizationByEmailDomain(organizationId);
