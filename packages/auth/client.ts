import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// The browser-side auth client. baseURL is same-origin (apps/app mounts the
// handler), so no explicit URL is needed in dev or prod.
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

// Clerk-shaped widget names, reimplemented on better-auth — the sidebar
// imports these from "@repo/auth/client".
// biome-ignore lint/performance/noBarrelFile: Package API re-export pattern for clean import surface
export { OrganizationSwitcher } from "./components/organization-switcher";
export { UserButton } from "./components/user-button";
