import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      KNOWLEDGE_MONGODB_DB: process.env.KNOWLEDGE_MONGODB_DB,
      KNOWLEDGE_MONGODB_URI: process.env.KNOWLEDGE_MONGODB_URI,
    },
    server: {
      KNOWLEDGE_MONGODB_DB: z.string().min(1).optional(),
      KNOWLEDGE_MONGODB_URI: z.string().min(1),
    },
  });
