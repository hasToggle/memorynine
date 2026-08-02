import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY,
      EXTRACTION_MODEL: process.env.EXTRACTION_MODEL,
      KNOWLEDGE_INBOUND_SENDERS: process.env.KNOWLEDGE_INBOUND_SENDERS,
      KNOWLEDGE_MONGODB_DB: process.env.KNOWLEDGE_MONGODB_DB,
      KNOWLEDGE_MONGODB_URI: process.env.KNOWLEDGE_MONGODB_URI,
    },
    server: {
      // Optional here: only the pipeline workers need these, and each
      // factory fails fast with a clearer message when its key is missing.
      AI_GATEWAY_API_KEY: z.string().min(1).optional(),
      ASSEMBLYAI_API_KEY: z.string().min(1).optional(),
      EXTRACTION_MODEL: z.string().min(1).optional(),
      /** JSON object mapping inbound sender emails to tenant ids. */
      KNOWLEDGE_INBOUND_SENDERS: z.string().min(1).optional(),
      KNOWLEDGE_MONGODB_DB: z.string().min(1).optional(),
      KNOWLEDGE_MONGODB_URI: z.string().min(1),
    },
  });
