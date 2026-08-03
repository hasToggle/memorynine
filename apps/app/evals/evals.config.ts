import { defineEvalConfig } from "eve/evals";

// Evals run against a live model and a live Atlas cluster — there is no way to
// mock the model of the agent under test from inside an eval, since mockModel
// is part of an agent definition. So these cost real inference, and they need
// KNOWLEDGE_MONGODB_URI pointing at a cluster whose search indexes exist.
//
// The judge is deliberately a different, stronger model than the agent: a model
// grading its own output agrees with itself.
export default defineEvalConfig({
  judge: { model: "anthropic/claude-sonnet-5" },
  maxConcurrency: 2,
});
