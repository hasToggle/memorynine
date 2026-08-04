import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { MongoClient, ObjectId } from "mongodb";
import { keys } from "./keys";

// The better-auth server instance. One authority for the whole monorepo:
// apps/app mounts its handler at /api/auth/[...all]; everything else talks
// to it through the compat layer in server.ts or the client in client.ts.
//
// Guarded like @repo/knowledge/client rather than via `server-only`: this
// must import in any server runtime (Next.js, scripts, a future agent app),
// and server-only's react-server export condition throws outside React.
if (typeof window !== "undefined") {
  throw new Error(
    "@repo/auth/instance is server-side only and must not reach a browser bundle"
  );
}

// The adapter maps ids to ObjectIds in storage but hands strings to hooks —
// reference fields must be matched in both forms.
export const idForms = (id: string) => ({
  $in: ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id],
});

const globalForAuth = global as unknown as { authMongo?: MongoClient };

const client =
  globalForAuth.authMongo ??
  new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
if (process.env.NODE_ENV !== "production") {
  globalForAuth.authMongo = client;
}
// Deliberately NOT client.db(process.env.MONGODB_DB ?? "app") like its three
// siblings (packages/database/index.ts, apps/email/scripts/digest.ts,
// apps/api/app/cron/keep-alive/route.ts). Those move "subscribers"/"digests"
// off the driver's implicit "test" default, which is safe because those
// collections were confirmed empty. better-auth's collections (user,
// session, organization, member, …) predate that rename and already hold
// live data in "test" — moving them requires an actual migration decision
// (migrate the data to "app", or keep reading "test" permanently) that this
// repo has not made. Until that decision is made, stay on the driver
// default so auth keeps reading where its data actually is.
const db = client.db();

export const authInstance = betterAuth({
  baseURL: keys().BETTER_AUTH_URL,
  // transaction: false — transactions need a replica set; Atlas has one but
  // local/standalone Mongo does not, and auth writes don't need multi-doc
  // atomicity badly enough to make the adapter environment-dependent.
  database: mongodbAdapter(db, { client, transaction: false }),
  databaseHooks: {
    session: {
      create: {
        // A fresh session has no active organization; default it to the
        // user's first membership so orgId-as-tenantId works right after
        // sign-in without an extra client round-trip.
        before: async (session) => {
          const membership = await db
            .collection<{ organizationId: unknown }>("member")
            .findOne({ userId: idForms(session.userId) as never });
          return {
            data: {
              ...session,
              activeOrganizationId: membership
                ? String(membership.organizationId)
                : undefined,
            },
          };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization(),
    // Must stay last: makes Set-Cookie work from server actions.
    nextCookies(),
  ],
  secret: keys().BETTER_AUTH_SECRET,
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ],
});

/** Raw handle to the auth database, for compat queries in server.ts. */
export const authDb = db;
