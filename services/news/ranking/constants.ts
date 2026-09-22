export const RANKING_VERSION = "challenge-v1";
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
