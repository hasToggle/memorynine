// better-auth 1.7.0 stopped emitting the bare `import "../../client/index.mjs"`
// side-effect line in its plugin .d.mts files. `organizationClient()`'s atoms are
// typed with `AuthQueryAtom`, which is only *declared* in the non-exported
// `better-auth/dist/client/query.mjs` and re-exported from the public
// `better-auth/client` barrel. Without that barrel in the program, declaration
// emit can't name the type portably (TS2883). This type-only import pulls the
// barrel back in and erases to nothing at runtime.
import type {} from "better-auth/client";
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
