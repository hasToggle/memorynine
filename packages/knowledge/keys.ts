import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      EXTRACTION_MODEL: process.env.EXTRACTION_MODEL,
      KNOWLEDGE_MONGODB_DB: process.env.KNOWLEDGE_MONGODB_DB,
      KNOWLEDGE_MONGODB_URI: process.env.KNOWLEDGE_MONGODB_URI,
    },
    server: {
      // Optional here: only the extraction worker needs the gateway, and it
      // fails fast in createGatewayGenerate with a clearer message.
      AI_GATEWAY_API_KEY: z.string().min(1).optional(),
      EXTRACTION_MODEL: z.string().min(1).optional(),
      KNOWLEDGE_MONGODB_DB: z.string().min(1).optional(),
      KNOWLEDGE_MONGODB_URI: z.string().min(1),
    },
  });
