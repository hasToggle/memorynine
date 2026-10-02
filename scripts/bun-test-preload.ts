// `bun test` preload for every workspace whose tests load the MongoDB driver
// (apps/api, apps/app, packages/knowledge). Wired up through each one's
// bunfig.toml, so it never runs in `next build` or in production.
//
// bson >= 7.3.0 (pulled in by mongodb >= 7.7.0) runs this when the module
// loads, to give ObjectId fresh randomness after a Node startup snapshot:
//
//   process.getBuiltinModule("v8").startupSnapshot?.isBuildingSnapshot?.()
//
// Bun < 1.4.0 does not leave that function out, it ships a stub that throws
// ERR_NOT_IMPLEMENTED, so bson's optional chaining does not help and every
// test file that imports mongodb dies before its first test. Bun 1.4.0
// implements it, which is why this passed locally (`packageManager` pins
// 1.4.x) while Vercel failed: its build image picks its own Bun 1.x and
// ignores `packageManager` for Bun.
//
// The stub is only replaced when it actually throws, so on Bun >= 1.4.0 this
// does nothing. Delete it, and the three bunfig.toml files, once Vercel's
// build image ships Bun >= 1.4.0.
interface StartupSnapshot {
  isBuildingSnapshot?: () => boolean;
}

const snapshot = (
  process.getBuiltinModule?.("v8") as
    | { startupSnapshot?: StartupSnapshot }
    | undefined
)?.startupSnapshot;

if (snapshot?.isBuildingSnapshot) {
  try {
    snapshot.isBuildingSnapshot();
  } catch {
    snapshot.isBuildingSnapshot = () => false;
  }
}
