import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      MONGODB_URI: process.env.MONGODB_URI,
    },
    server: {
      MONGODB_URI: z.string().min(1),
    },
  });
