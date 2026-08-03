# Evals

Regression checks for the ask agent. `eve eval` boots the agent, drives real
sessions over its HTTP surface, and grades what comes back.

```bash
cd apps/app
bunx eve eval                 # all
bunx eve eval citations       # one
bunx eve eval --strict        # soft threshold misses fail too (use in CI)
```

## What these need

Unlike the `@repo/knowledge` suite, these are **not** hermetic:

- **A live model.** There is no way to mock the model of the agent under test
  from inside an eval — `mockModel` is part of an agent definition, so it only
  applies to a dedicated fixture agent. Every run costs inference.
- **A live Atlas cluster** with the search indexes provisioned
  (`bun scripts/setup-indexes.ts` in `packages/knowledge`). Without
  `facts_search` and `facts_vector` the search tool errors and every eval fails
  for the same uninteresting reason.
- **A tenant with facts in it.** `citations` asserts a property that only has
  teeth once search returns something; against an empty tenant it passes
  vacuously, which is why it also checks that a non-empty result set produced at
  least one citation.

## What is deliberately deterministic

`citations` uses no judge. It extracts the ids from the prose and the ids from
the tool output and compares them — the same resolution the UI performs. A
hallucinated id is invisible to a reader and to an LLM judge alike, because it
looks exactly like a real one; only the comparison catches it.

Judges are used where the property is genuinely fuzzy: whether a refusal reads
as "we have nothing" rather than as an answer.

## What is still missing

A German golden set drawn from this company's own corpus. Published benchmarks
will not predict retrieval quality here — the categories that matter most
(knowledge-update, abstention) are the least statistically powered in every
public suite, and one measured result has a small reranker pushing German
retrieval *below* the no-rerank baseline out of domain.

Build 50–100 cases from real captured sources, covering: a role that changed, an
engagement that ended, a preference that was retracted, and a question whose
answer spans two sources. Score with a paired design — 93 cases per arm to
detect a 20-point difference, 388 for 10 points — and prefer `pass^k` over
`pass@k` when judging a job that can quietly poison the store.
