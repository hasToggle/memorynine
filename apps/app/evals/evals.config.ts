import { defineEvalConfig } from "eve/evals";

// Evals run against a live model and a live Atlas cluster — there is no way to
// mock the model of the agent under test from inside an eval, since mockModel
// is part of an agent definition. So these cost real inference, and they need
// KNOWLEDGE_MONGODB_URI pointing at a cluster whose search indexes exist.
//
// The judge is deliberately a different, stronger model than the agent: a model
// grading its own output agrees with itself.
//
// ZDR is pinned here rather than left to a dashboard toggle, so the eval
// suite's data posture is visible in the repo. It hard-fails: an uncovered
// model returns 400 no_providers_available rather than routing anyway (see
// packages/knowledge/scripts/probe-zdr.ts, which checks this directly). If a
// probe run ever shows this judge is not ZDR-covered, change the judge model
// here — not this setting. The eval corpus is entirely synthetic, so ZDR
// protects nothing during a run; the only requirement on a judge is that it
// is a different model family from the agent under test and at least as
// capable.
export default defineEvalConfig({
  judge: {
    model: "anthropic/claude-sonnet-5",
    modelOptions: {
      providerOptions: { gateway: { zeroDataRetention: true } },
    },
  },
  maxConcurrency: 2,
});
