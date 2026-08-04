// Pure arithmetic for scoring an extraction eval against hand-authored
// ground truth. Kept separate from eval-extraction.ts (which does the I/O:
// prompting, calling the judge, writing raw responses) so the numbers that
// end up in a report can be tested without a mock gateway — a wrong formula
// here produces a confident wrong score, which is the worst failure mode an
// eval can have.

export interface SourceGradeCounts {
  /** Extracted facts for this source. */
  extractedCount: number;
  /** Planted (hand-authored) facts for this source. */
  groundTruthCount: number;
  /** Extracted facts the judge found unsupported by any ground-truth fact. */
  invented: number;
  /** Distinct ground-truth facts the judge found conveyed by some extracted fact. */
  matched: number;
}

export interface SourceMetrics extends SourceGradeCounts {
  /** invented / extracted. Vacuously 0 when nothing was extracted. */
  inventionRate: number;
  /** (extracted - invented) / extracted. Vacuously 1 when nothing was extracted. */
  precision: number;
  /** matched / groundTruth. Vacuously 1 when there was no ground truth to find. */
  recall: number;
}

/**
 * Scores one source (or one pooled total) from raw counts. The three
 * division-by-zero cases are resolved the same way throughout this module:
 * a rate with an empty denominator is vacuously perfect (1, or 0 for
 * invention rate specifically, since "0 invented out of 0 extracted" is not
 * a defect) — there is nothing in that denominator to have gotten wrong.
 */
export const scoreSource = (counts: SourceGradeCounts): SourceMetrics => {
  const { extractedCount, groundTruthCount, invented, matched } = counts;
  const recall = groundTruthCount === 0 ? 1 : matched / groundTruthCount;
  const precision =
    extractedCount === 0 ? 1 : (extractedCount - invented) / extractedCount;
  const inventionRate = extractedCount === 0 ? 0 : invented / extractedCount;
  return {
    extractedCount,
    groundTruthCount,
    invented,
    inventionRate,
    matched,
    precision,
    recall,
  };
};

/**
 * Micro-averages across sources: sums raw counts first, then scores once.
 * Deliberately NOT an average of per-source rates (a "macro" average) —
 * that would let a source with 1 ground-truth fact and a source with 20
 * outvote each other equally, which misrepresents a corpus where sources
 * carry very different numbers of planted facts.
 */
export const aggregateMetrics = (
  sources: readonly SourceGradeCounts[]
): SourceMetrics => {
  const totals = sources.reduce(
    (acc, s) => ({
      extractedCount: acc.extractedCount + s.extractedCount,
      groundTruthCount: acc.groundTruthCount + s.groundTruthCount,
      invented: acc.invented + s.invented,
      matched: acc.matched + s.matched,
    }),
    { extractedCount: 0, groundTruthCount: 0, invented: 0, matched: 0 }
  );
  return scoreSource(totals);
};

export interface JudgeVerdict {
  invented: number[];
  matched: number[];
}

export interface JudgeVerdictCounts {
  extractedCount: number;
  groundTruthCount: number;
  /** Indices the judge returned that fell outside the valid range for their side, kept for diagnostics. */
  invalidIndices: { invented: number[]; matched: number[] };
  invented: number;
  matched: number;
}

const isValidOneBasedIndex = (index: number, max: number): boolean =>
  Number.isInteger(index) && index >= 1 && index <= max;

/**
 * Turns a judge's raw {matched, invented} verdict into counts, validating
 * each side against ITS OWN range: "matched" lists GROUND-TRUTH indices (so
 * it is bounded by groundTruthCount) and "invented" lists EXTRACTED indices
 * (bounded by extractedCount). Mixing these two ranges up is the easiest
 * mistake to make when wiring a judge call to this function — get it wrong
 * and every metric downstream is confidently corrupted — so this is the
 * single seam where that validation happens, and it is exercised directly
 * by tests rather than trusted to the caller.
 */
export const applyJudgeVerdict = (
  verdict: JudgeVerdict,
  groundTruthCount: number,
  extractedCount: number
): JudgeVerdictCounts => {
  const matchedValid = new Set<number>();
  const matchedInvalid: number[] = [];
  for (const index of verdict.matched) {
    if (isValidOneBasedIndex(index, groundTruthCount)) {
      matchedValid.add(index);
    } else {
      matchedInvalid.push(index);
    }
  }

  const inventedValid = new Set<number>();
  const inventedInvalid: number[] = [];
  for (const index of verdict.invented) {
    if (isValidOneBasedIndex(index, extractedCount)) {
      inventedValid.add(index);
    } else {
      inventedInvalid.push(index);
    }
  }

  return {
    extractedCount,
    groundTruthCount,
    invalidIndices: { invented: inventedInvalid, matched: matchedInvalid },
    invented: inventedValid.size,
    matched: matchedValid.size,
  };
};

export interface SkipRecord {
  declaredSkip: boolean;
  shouldSkip: boolean;
}

export interface SkipAccuracy {
  accuracy: number;
  correct: number;
  total: number;
}

/**
 * Of the sources whose ground truth says shouldSkip, how many did
 * extraction correctly decline to extract from. Sources where shouldSkip is
 * false never enter the denominator — a model that skips a source it
 * shouldn't have is a recall failure on that source's facts, not a skip
 * accuracy failure.
 */
export const skipAccuracy = (records: readonly SkipRecord[]): SkipAccuracy => {
  const skipRecords = records.filter((r) => r.shouldSkip);
  const correct = skipRecords.filter((r) => r.declaredSkip).length;
  const total = skipRecords.length;
  return { accuracy: total === 0 ? 1 : correct / total, correct, total };
};
