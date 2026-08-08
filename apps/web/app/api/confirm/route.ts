import { createId, database } from "@repo/database";
import { resend } from "@repo/email";
import ConfirmSubscription from "@repo/email/templates/confirm-subscription";
import { parseError } from "@repo/observability/error";
import { log } from "@repo/observability/log";
import { after, type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import {
  type ValidationFailureReason,
  validateEmail,
} from "@/lib/email-validation";
import { generateToken } from "@/lib/token";

const TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24;

// Vague messaging for disposable/undeliverable to avoid revealing rejection reason
const VALIDATION_MESSAGES: Record<ValidationFailureReason, string> = {
  disposable:
    "This email address doesn't look quite right. Mind trying another one?",
  invalid_format: "Invalid email address provided",
  undeliverable:
    "This email address doesn't look quite right. Mind trying another one?",
};

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    const validation = await validateEmail(email);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: {
            message: VALIDATION_MESSAGES[validation.reason],
            name: "ValidationError",
          },
        },
        { status: 400 }
      );
    }

    const { token, hash } = generateToken();

    await database.subscriber.updateOne(
      { email },
      {
        $set: {
          token: hash,
          tokenExpiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
        },
        $setOnInsert: {
          _id: createId(),
          createdAt: new Date(),
          emailVerified: null,
          image: null,
          name: null,
          role: "user",
        },
      },
      { upsert: true }
    );

    const { error } = await resend.emails.send({
      from: env.RESEND_FROM,
      react: ConfirmSubscription({
        baseUrl: new URL(request.url).origin,
        token,
      }),
      subject: "Important: Confirm your subscription",
      to: [email],
    });

    if (error) {
      log.error(`Failed to send confirmation email: ${JSON.stringify(error)}`);
      return NextResponse.json(
        {
          error: {
            message: "Failed to send confirmation email",
            name: "EmailError",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Confirm your subscription.",
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: { message: "Invalid request body", name: "ValidationError" },
        },
        { status: 400 }
      );
    }
    after(() => parseError(error));
    return NextResponse.json(
      {
        error: { message: "An unexpected error occurred", name: "ServerError" },
      },
      { status: 500 }
    );
  }
}
