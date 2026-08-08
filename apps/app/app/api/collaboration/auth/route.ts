import { auth, currentUser } from "@repo/auth/server";
import { authenticate } from "@repo/collaboration/auth";

const COLORS = [
  "var(--color-red-500)",
  "var(--color-orange-500)",
  "var(--color-amber-500)",
  "var(--color-yellow-500)",
  "var(--color-lime-500)",
  "var(--color-green-500)",
  "var(--color-emerald-500)",
  "var(--color-teal-500)",
  "var(--color-cyan-500)",
  "var(--color-sky-500)",
  "var(--color-blue-500)",
  "var(--color-indigo-500)",
  "var(--color-violet-500)",
  "var(--color-purple-500)",
  "var(--color-fuchsia-500)",
  "var(--color-pink-500)",
  "var(--color-rose-500)",
];

export const POST = async () => {
  const user = await currentUser();
  const { orgId } = await auth();

  if (!(user && orgId)) {
    return new Response("Unauthorized", { status: 401 });
  }

  return authenticate({
    orgId,
    userId: user.id,
    userInfo: {
      // The auth shim normalises a missing image to "", which is not a URL.
      avatar: user.imageUrl || undefined,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      name:
        user.fullName ?? user.emailAddresses.at(0)?.emailAddress ?? undefined,
    },
  });
};
