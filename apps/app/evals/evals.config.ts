import { defineEvalConfig } from "eve/evals";

// Evals run against a live model and a live Atlas cluster — there is no way to
// mock the model of the agent under test from inside an eval, since mockModel
// is part of an agent definition. So these cost real inference, and they need
// KNOWLEDGE_MONGODB_URI pointing at a cluster whose search indexes exist.
//
// The judge is deliberately a different model from the agent: a model grading
// its own output agrees with itself.
//
// Since eve 0.62 the judge is an *evaluation* model, not a language model:
// `t.judge` routes through AI SDK `evaluate`, and a string id is resolved by
// the provider's evaluation API rather than its chat API. The Gateway's only
// native evaluation model is `typesafe-ai/jev` — handing it a language-model
// id such as "anthropic/claude-sonnet-5" does not silently fall back to a
// chat completion, it fails the judgment. Using a language model as a judge
// now means an explicit adapter instance (e.g. `anthropic.evaluationModel(…)`)
// on that provider's own credentials, which would take the eval suite off the
// Gateway and out from under the ZDR pin below.
//
// ZDR is pinned here rather than left to a dashboard toggle, so the eval
// suite's data posture is visible in the repo. It hard-fails: an uncovered
// model returns 400 no_providers_available rather than routing anyway (see
// packages/knowledge/scripts/probe-zdr.ts, which checks this directly). If a
// probe run ever shows this judge is not ZDR-covered, change the judge model
// here — not this setting. The eval corpus is entirely synthetic, so ZDR
// protects nothing during a run; the only requirement on a judge is that it
// is a different model from the agent under test and at least as capable.
export default defineEvalConfig({
  judge: {
    model: "typesafe-ai/jev",
    modelOptions: {
      providerOptions: { gateway: { zeroDataRetention: true } },
    },
  },
  maxConcurrency: 2,
});
