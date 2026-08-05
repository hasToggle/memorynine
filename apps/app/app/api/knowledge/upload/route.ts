import { auth } from "@repo/auth/server";
import { issueSignedToken } from "@repo/storage";
import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from "@repo/storage/client";
import { NextResponse } from "next/server";
import { ACCEPTED_AUDIO_CONTENT_TYPES } from "@/lib/capture";

// Presigned client uploads into the PRIVATE blob store: the browser never
// holds a read-write token, and the issued token is scoped to a single
// voice/ pathname with audio-only content types and a size cap.

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const VOICE_PREFIX_REGEX = /^voice\/[^/]+$/;

export const POST = async (request: Request): Promise<NextResponse> => {
  // Checked here rather than left to the SDK. `handleUploadPresigned` throws
  // "Missing webhook public key" as its very first statement, and the browser
  // never sees it: `uploadPresigned` does `if (!res.ok) throw new
  // BlobError("Failed to retrieve the presigned URL")` without reading the
  // response body, so every server-side cause arrives at the user as the same
  // generic sentence. Naming the variable here, and logging it, is the only
  // way an operator learns what is actually wrong.
  if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
    const message =
      "BLOB_WEBHOOK_PUBLIC_KEY is not set — presigned uploads cannot work. Connect a Vercel Blob store to this project and run `vercel env pull`.";
    console.error(`[knowledge/upload] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const body = (await request.json()) as HandleUploadPresignedBody;

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      getSignedToken: async (pathname) => {
        const { orgId, userId } = await auth();
        if (!(orgId && userId)) {
          throw new Error("Not authorized");
        }
        if (!VOICE_PREFIX_REGEX.test(pathname)) {
          throw new Error("Uploads must live under voice/");
        }
        const token = await issueSignedToken({
          allowedContentTypes: [...ACCEPTED_AUDIO_CONTENT_TYPES],
          maximumSizeInBytes: MAX_AUDIO_BYTES,
          operations: ["put"],
          pathname,
          validUntil: Date.now() + TOKEN_TTL_MS,
        });
        return {
          token,
          urlOptions: {
            addRandomSuffix: true,
            allowedContentTypes: [...ACCEPTED_AUDIO_CONTENT_TYPES],
            allowOverwrite: false,
            maximumSizeInBytes: MAX_AUDIO_BYTES,
            validUntil: Date.now() + TOKEN_TTL_MS,
          },
        };
      },
      request,
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The client cannot see this — see the note above — so the server log is
    // the only record of why an upload failed.
    console.error(`[knowledge/upload] ${message}`);
    return NextResponse.json(
      { error: message },
      { status: message === "Not authorized" ? 401 : 400 }
    );
  }
};
