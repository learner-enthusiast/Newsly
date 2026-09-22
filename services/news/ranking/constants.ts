export const RANKING_VERSION = "challenge-v1";
export const FINAL_RANKING_VERSION = "final-v1";

export const FINAL_RANKING_METHODOLOGY = `final_challenge_v1: Eligible events must have verification, evaluation, ≥1 sourced document, region, event date, and reasoning text. Final score = 0.32×primaryRankScore + 0.28×independentRankScore + 0.22×evaluationImportance + 0.12×evidenceConfidence + 0.06×narrativeSignificance − disagreementPenalty (0.10 when requiresReview). Not a blind average of raw LLM dimension scores. Near-duplicate suppression: within the same narrative, if title Jaccard ≥ 0.85, keep only the highest composite score. Coverage-gap events included only after full ingest→understand→event→evidence pipeline. Article/syndication volume is not a scoring input.`;
export const PRIMARY_RANKER_PROMPT_VERSION = "primary-ranker-v1";
export const INDEPENDENT_RANKER_PROMPT_VERSION = "independent-ranker-v1";
export const COVERAGE_GAP_PROMPT_VERSION = "coverage-gap-v1";

export const PRIMARY_CANDIDATE_POOL_SIZE = Number(
  process.env.RANKING_PRIMARY_POOL_SIZE ?? 30,
);
export const FINALIST_COUNT = Number(process.env.RANKING_FINALIST_COUNT ?? 10);
export const LLM_PREPOOL_SIZE = Number(process.env.RANKING_LLM_PREPOOL_SIZE ?? 45);

export const RANK_DISAGREEMENT_REVIEW_THRESHOLD = Number(
  process.env.RANKING_DISAGREEMENT_RANK_THRESHOLD ?? 3,
);
export const SCORE_DISAGREEMENT_REVIEW_THRESHOLD = Number(
  process.env.RANKING_DISAGREEMENT_SCORE_THRESHOLD ?? 0.15,
);
