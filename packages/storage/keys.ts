import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
      BLOB_WEBHOOK_PUBLIC_KEY: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
    },
    server: {
      BLOB_READ_WRITE_TOKEN: z.string().optional(),
      /**
       * Required by `handleUploadPresigned` for the presigned client-upload
       * flow — it verifies the upload-completed callback Vercel Blob signs.
       * The SDK checks it as the FIRST statement of that function, before the
       * event switch and before any token is issued, and it checks it even
       * when no `onUploadCompleted` handler is supplied.
       *
       * Optional here because only apps that accept client uploads need it;
       * declared so it appears in the env surface rather than being
       * discovered from a 400 at runtime. Vercel provisions it on a project
       * once a Blob store is connected — `vercel env pull` brings it down.
       */
      BLOB_WEBHOOK_PUBLIC_KEY: z.string().optional(),
    },
  });
