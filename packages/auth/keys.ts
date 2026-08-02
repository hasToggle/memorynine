import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    client: {},
    runtimeEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    },
    server: {
      // Optional so builds without auth env (marketing site, CI) still pass;
      // better-auth itself refuses to run in production without a secret.
      BETTER_AUTH_SECRET: z.string().min(32).optional(),
      BETTER_AUTH_URL: z.string().url().optional(),
    },
  });
