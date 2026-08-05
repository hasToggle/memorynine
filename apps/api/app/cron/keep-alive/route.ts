import { database } from "@repo/database";

export const GET = async () => {
  await database.client
    .db(process.env.MONGODB_DB ?? "app")
    .command({ ping: 1 });

  return new Response("OK", { status: 200 });
};
