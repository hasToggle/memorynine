import { z } from "zod";
import { baseDocFields } from "./shared";

export const sourceStatusValues = [
  "received",
  "transcribed",
  "extracting",
  "proposed",
  "reviewed",
  "failed",
] as const;

export const sourceSchema = z.object({
  ...baseDocFields,
  attachments: z
    .array(
      z.object({
        blobUrl: z.url(),
        contentType: z.string().min(1),
        filename: z.string().min(1),
      })
    )
    .optional(),
  audio: z
    .object({
      blobUrl: z.url(),
      contentType: z.string().min(1),
      durationSeconds: z.number().positive().optional(),
    })
    .optional(),
  // Set by the erasure cascade when every fact backed by this source is gone:
  // the caller must delete the referenced blobs, then unset audio/attachments.
  blobsPendingDeletion: z.boolean().optional(),
  capturedBy: z.string().min(1),
  // The textual payload: transcript (voice), body (email), or pasted text (manual).
  content: z.string().optional(),
  email: z
    .object({
      forwardedBy: z.string().min(1),
      gmailMessageId: z.string().min(1),
      originalSender: z.string().min(1),
      sentAt: z.date(),
      subject: z.string(),
    })
    .optional(),
  error: z.string().optional(),
  status: z.enum(sourceStatusValues),
  type: z.enum(["voice", "email", "manual"]),
});
export type Source = z.infer<typeof sourceSchema>;
