#!/usr/bin/env node
// Vercel "Ignore Build Step" for this Turborepo.
//
// Referenced from apps/*/vercel.json as `node ../../scripts/skip-ci.js`. The
// file it named never existed in this fork — the reference came in with the
// initial commit and the build only ever proceeded because a missing file
// makes node exit 1, which Vercel reads as "build". That worked by accident.
//
// EXIT CODES, and they are the inverse of what most CI tools use:
//   Vercel:            0 = ignore the build, 1 = continue with the build.
//   turbo query:       0 = nothing affected, 1 = affected, 2 = error.
// Those line up, so the turbo exit code passes straight through — except for
// its error code, which we deliberately turn into "build".
//
// EVERY UNCERTAIN CASE BUILDS. Skipping a build that should have happened
// ships stale code and is invisible; building one that could have been skipped
// costs a couple of minutes. The asymmetry is not close, so anything we cannot
// answer confidently — no previous deployment, a turbo error, an unreadable
// package.json — resolves to "build".
//
// `turbo-ignore` used to do this job and still works, but it now prints its
// own deprecation notice pointing at `turbo query affected`, so this uses the
// replacement directly rather than adopting a tool on the way out.

// ESM, not CommonJS: the root package.json sets "type": "module", so a .js
// file here is a module and `require` is not defined. The same trap once broke
// the whole eval suite via a `require.main === module` guard.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BUILD = 1;
const SKIP = 0;

/** @param {string} reason */
const build = (reason) => {
  process.stdout.write(`▲ build: ${reason}\n`);
  process.exit(BUILD);
};

/** @param {string} reason */
const skip = (reason) => {
  process.stdout.write(`⏭ skip: ${reason}\n`);
  process.exit(SKIP);
};

// The workspace is inferred from the package.json in the working directory,
// which on Vercel is the project's Root Directory (apps/app or apps/api). If
// that is not where we are, we cannot tell which workspace to ask about.
let workspace;
try {
  workspace = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8")
  ).name;
} catch {
  build(`no readable package.json in ${process.cwd()}`);
}

if (!workspace) {
  build(`package.json in ${process.cwd()} has no name field`);
}

// Vercel sets this to the SHA of the last *successful* deployment of this
// project. It is empty on a first deployment, and can be empty when the
// previous deployment was removed.
const base = process.env.VERCEL_GIT_PREVIOUS_SHA;
if (!base) {
  build("no previous deployment to compare against");
}

try {
  execFileSync(
    "npx",
    [
      "--yes",
      "turbo",
      "query",
      "affected",
      "--packages",
      workspace,
      "--base",
      base,
      "--exit-code",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  // Exit 0 from turbo: nothing in this workspace or its dependencies changed.
  skip(`"${workspace}" and its dependencies are unchanged since ${base}`);
} catch (error) {
  if (error.status === BUILD) {
    build(`"${workspace}" or one of its dependencies changed since ${base}`);
  }
  // Status 2 is a turbo error; anything else means npx itself failed. Neither
  // is an answer, so both build.
  process.stdout.write(`${error.stderr ?? error.message ?? ""}\n`);
  build(`could not determine what changed (turbo exit ${error.status})`);
}
