import { analytics } from "@repo/analytics/server";
import { auth } from "@repo/auth/server";
import { flag } from "flags/next";

export const createFlag = (key: string, description?: string) =>
  flag({
    async decide() {
      const { userId } = await auth();

      if (!userId) {
        return this.defaultValue as boolean;
      }

      // isFeatureEnabled is deprecated in posthog-node 5.x; `flagKeys` scopes
      // the /flags request to the one flag we're deciding. A failed request
      // yields an empty snapshot rather than throwing, and getFlag (unlike
      // isEnabled, which reports a flat false) tells those apart, so the
      // default still wins when PostHog has nothing to say.
      const flags = await analytics.evaluateFlags(userId, { flagKeys: [key] });
      const value = flags.getFlag(key);

      return value === undefined
        ? (this.defaultValue as boolean)
        : value !== false;
    },
    defaultValue: false,
    description,
    key,
    options: [
      { label: "On", value: true },
      { label: "Off", value: false },
    ],
  });
