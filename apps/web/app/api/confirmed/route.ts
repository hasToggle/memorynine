import { database } from "@repo/database";
import { resend } from "@repo/email";
import { parseError } from "@repo/observability/error";
import { after, type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { generateTokenHash } from "@/lib/token";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "A valid confirmation link is required" },
        { status: 400 }
      );
    }

    const subscriber = await database.subscriber.findOne({
      token: generateTokenHash(token),
      tokenExpiresAt: { $gte: new Date() },
    });

    if (!subscriber) {
      return NextResponse.json(
        { error: "Invalid or expired confirmation link" },
        { status: 400 }
      );
    }

    const updatePromise = subscriber.emailVerified
      ? Promise.resolve()
      : database.subscriber.updateOne(
          { _id: subscriber._id },
          { $set: { emailVerified: new Date(), tokenExpiresAt: null } }
        );

    const contactPromise = resend.contacts.create({
      audienceId: env.RESEND_AUDIENCE_ID,
      email: subscriber.email,
      unsubscribed: false,
    });

    const [, { error }] = await Promise.all([updatePromise, contactPromise]);

    if (error) {
      after(() => parseError(error));
    }

    return new Response(null, {
      headers: {
        Location: "/confirmed",
      },
      status: 303,
    });
  } catch (error) {
    after(() => parseError(error));
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
