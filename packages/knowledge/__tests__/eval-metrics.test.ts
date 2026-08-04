import { describe, expect, test } from "bun:test";
import {
  aggregateMetrics,
  applyJudgeVerdict,
  scoreSource,
  skipAccuracy,
} from "../eval-metrics";

describe("scoreSource", () => {
  test("zero extracted facts: precision is vacuously 1, invention rate is 0", () => {
    const metrics = scoreSource({
      extractedCount: 0,
      groundTruthCount: 3,
      invented: 0,
      matched: 0,
    });
    expect(metrics.precision).toBe(1);
    expect(metrics.inventionRate).toBe(0);
    // Nothing was extracted, so nothing could have been matched either.
    expect(metrics.recall).toBe(0);
  });

  test("zero ground truth: recall is vacuously 1", () => {
    const metrics = scoreSource({
      extractedCount: 2,
      groundTruthCount: 0,
      invented: 0,
      matched: 0,
    });
    expect(metrics.recall).toBe(1);
  });

  test("zero ground truth and zero extracted: every rate is vacuously perfect", () => {
    const metrics = scoreSource({
      extractedCount: 0,
      groundTruthCount: 0,
      invented: 0,
      matched: 0,
    });
    expect(metrics.recall).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.inventionRate).toBe(0);
  });

  test("all-invented: precision 0, invention rate 1", () => {
    const metrics = scoreSource({
      extractedCount: 3,
      groundTruthCount: 2,
      invented: 3,
      matched: 0,
    });
    expect(metrics.precision).toBe(0);
    expect(metrics.inventionRate).toBe(1);
    expect(metrics.recall).toBe(0);
  });

  test("all-matched: recall 1, and matched facts do not count as invention", () => {
    const metrics = scoreSource({
      extractedCount: 2,
      groundTruthCount: 2,
      invented: 0,
      matched: 2,
    });
    expect(metrics.recall).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.inventionRate).toBe(0);
  });

  test("mixed case computes recall, precision and invention rate independently", () => {
    // 2 ground truth facts, 3 extracted: 1 matched, 1 invented, 1 neither
    // (a paraphrase/split the judge treated as non-invented but also
    // non-matching — this is a legitimate zone, not a bug).
    const metrics = scoreSource({
      extractedCount: 3,
      groundTruthCount: 2,
      invented: 1,
      matched: 1,
    });
    expect(metrics.recall).toBe(0.5);
    expect(metrics.precision).toBeCloseTo(2 / 3, 10);
    expect(metrics.inventionRate).toBeCloseTo(1 / 3, 10);
  });
});

describe("applyJudgeVerdict — the matched/invented index asymmetry", () => {
  test("matched indices are validated against ground-truth count, invented against extracted count", () => {
    // groundTruthCount=2, extractedCount=5: index 5 is a valid EXTRACTED
    // index but not a valid GROUND-TRUTH index, so it must be rejected from
    // "matched" even though it would be accepted into "invented".
    const counts = applyJudgeVerdict(
      { invented: [5], matched: [1, 2, 5] },
      2,
      5
    );
    expect(counts.matched).toBe(2);
    expect(counts.invalidIndices.matched).toEqual([5]);
    expect(counts.invented).toBe(1);
    expect(counts.invalidIndices.invented).toEqual([]);
  });

  test("swapped verdict (invented uses ground-truth-sized indices, matched uses extracted-sized) is caught, not silently accepted", () => {
    // groundTruthCount=2, extractedCount=6. If the judge (or a caller bug)
    // put a ground-truth-range index into "invented" and an
    // extracted-range-only index into "matched", both are still validated
    // against their OWN side's range, so a index of 6 in "matched" (out of
    // range for groundTruthCount=2) must be dropped.
    const counts = applyJudgeVerdict(
      { invented: [1, 2], matched: [1, 6] },
      2,
      6
    );
    expect(counts.matched).toBe(1); // only index 1 is valid for groundTruthCount=2
    expect(counts.invalidIndices.matched).toEqual([6]);
    expect(counts.invented).toBe(2); // both 1 and 2 are valid for extractedCount=6
    expect(counts.invalidIndices.invented).toEqual([]);
  });

  test("deduplicates repeated indices", () => {
    const counts = applyJudgeVerdict(
      { invented: [1, 1, 1], matched: [1, 1] },
      2,
      3
    );
    expect(counts.matched).toBe(1);
    expect(counts.invented).toBe(1);
  });

  test("drops non-integer, zero and negative indices", () => {
    const counts = applyJudgeVerdict(
      { invented: [0, -1, 1.5], matched: [0, -1, 1.5] },
      3,
      3
    );
    expect(counts.matched).toBe(0);
    expect(counts.invented).toBe(0);
    expect(counts.invalidIndices.matched).toEqual([0, -1, 1.5]);
    expect(counts.invalidIndices.invented).toEqual([0, -1, 1.5]);
  });

  test("empty verdict against non-empty sides yields zero counts, no invalid indices", () => {
    const counts = applyJudgeVerdict({ invented: [], matched: [] }, 3, 4);
    expect(counts.matched).toBe(0);
    expect(counts.invented).toBe(0);
    expect(counts.invalidIndices).toEqual({ invented: [], matched: [] });
  });
});

describe("aggregateMetrics", () => {
  test("micro-averages across sources (sums counts, then scores once) rather than averaging per-source rates", () => {
    // Source A: 1/1 matched (recall 1). Source B: 0/1 matched (recall 0).
    // A naive average-of-rates would give 0.5; the correct micro-average
    // over pooled counts is 1/2 = 0.5 here too, so pick counts where the
    // two diverge: source A has 4x the ground truth of source B.
    const overall = aggregateMetrics([
      { extractedCount: 4, groundTruthCount: 4, invented: 0, matched: 4 },
      { extractedCount: 1, groundTruthCount: 1, invented: 0, matched: 0 },
    ]);
    // Macro (average of rates) would be (1 + 0) / 2 = 0.5.
    // Micro (pooled) is 4 matched / 5 ground truth = 0.8.
    expect(overall.recall).toBeCloseTo(0.8, 10);
  });

  test("empty list of sources is the all-zero vacuous case", () => {
    const overall = aggregateMetrics([]);
    expect(overall.recall).toBe(1);
    expect(overall.precision).toBe(1);
    expect(overall.inventionRate).toBe(0);
    expect(overall.groundTruthCount).toBe(0);
    expect(overall.extractedCount).toBe(0);
  });
});

describe("skipAccuracy", () => {
  test("counts only shouldSkip=true sources in the denominator", () => {
    const result = skipAccuracy([
      { declaredSkip: true, shouldSkip: true },
      { declaredSkip: false, shouldSkip: true },
      { declaredSkip: false, shouldSkip: false }, // not a skip source, ignored
      { declaredSkip: true, shouldSkip: false }, // false positive skip, ignored (not in denominator)
    ]);
    expect(result.total).toBe(2);
    expect(result.correct).toBe(1);
    expect(result.accuracy).toBe(0.5);
  });

  test("zero shouldSkip sources: accuracy is vacuously 1", () => {
    const result = skipAccuracy([{ declaredSkip: false, shouldSkip: false }]);
    expect(result.total).toBe(0);
    expect(result.correct).toBe(0);
    expect(result.accuracy).toBe(1);
  });
});
