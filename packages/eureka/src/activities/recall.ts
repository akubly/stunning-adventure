/**
 * recall — retrieve top-k relevant facts from memory.
 *
 * Activity: recall (§10 §10.1)
 * Seam:     FactStore.search() — injected via deps (§20 §7.4, §55 §2.1)
 * AC:       AC-1.3 keyword-scoped recall at ≥80% precision
 * AC-FR-2:  Composite-ranker ordering (§30 §1.2)
 */

import type { SessionId } from '@akubly/types';

/** Minimal fact shape returned from FactStore.search() at the storage seam. */
export interface RecallResult {
  content: string;
  trust: number;
  attention_tier: 'hot' | 'warm' | 'cold';
  /** Normalized BM25 relevance score ∈ [0,1] returned by FactStore.search(). */
  relevance?: number;
  /** Importance signal ∈ [0,1]. */
  importance?: number;
  /** Unix epoch ms — used to compute query-time recency (§30 §1.2). */
  last_accessed?: number;
}

/** Fact paired with its FR-2 composite score. */
export interface ScoredResult {
  fact: RecallResult;
  score: number;
}

/** FactStore seam — injected, never instantiated here (§55 §2.1 London form). */
export interface FactStore {
  search(args: {
    query: string;
    sessionId: SessionId;
    limit: number;
    /** Trust floor predicate per §20 §7.4 — store applies WHERE trust >= minTrust. Default 0.15. */
    minTrust?: number;
  }): Promise<RecallResult[]>;
}

export interface RecallOptions {
  query: string;
  sessionId: SessionId;
  k: number;
}

/**
 * Clock seam for deterministic recency tests (§55 §1.2 + §30 §2.4).
 * Timestamps are non-deterministic inputs → must be injectable per §55 §1.2.
 *
 * Unit: milliseconds (consistent with existing impl; §30 §2.4 spec uses seconds —
 * §-tension flagged in laura-m4-clock-red decision drop).
 */
export interface ClockProvider {
  /** Returns current Unix timestamp in milliseconds. */
  now(): number;
}

/**
 * Optional custom ranker seam — replaces inline compositeScore when provided.
 * Receives trust-filtered candidates and nowMs; sorting and slicing to k remain
 * in recall/recallWithScores.
 *
 * Note: recallWithScores always re-sorts; ordering produced by Ranker is ignored.
 * Return scored pairs; sorting is the caller's responsibility.
 */
export type Ranker = (facts: RecallResult[], deps: { nowMs: number }) => ScoredResult[];

export interface RecallDeps {
  factStore: FactStore;
  /**
   * Clock provider for query-time recency (§30 §2.4).
   * REQUIRED — no optional default; defaults hide non-determinism per §55 §1.2.
   * §-tension: §30 §2.4 suggests optional default to SystemClock; §55 §1.2 prohibits.
   */
  clock: ClockProvider;
  /** Optional custom ranker — when provided, replaces inline compositeScore. */
  ranker?: Ranker;
}

// TODO(M5+): per-call trustFloor override via RecallOptions — needs §-decision;
// tracked in cassima-crispin-recall-undersupply-resolution. min_trust IS now
// configurable at the FactStore boundary (F6); the remaining work is wiring an
// optional RecallOptions.trustFloor through as minTrust: options.trustFloor ?? TRUST_FLOOR.
/** Trust floor per §30 §2.3 — exclude facts below this threshold. */
const TRUST_FLOOR = 0.15;

/**
 * Attention multipliers per §30 §1.2 (FR-2 canonical ranker formula).
 * §50 line 211 contains incorrect values (hot=1.0/warm=0.5/cold=0.1) —
 * §30 §1.2 is the authoritative source; §50 cleanup is Crispin/Genesta's call.
 */
const ATTENTION_MULTIPLIERS: Record<'hot' | 'warm' | 'cold', number> = {
  hot:  1.20,
  warm: 1.00,
  cold: 0.80,
};

/**
 * FR-2 composite score (§30 §1.2):
 *   rawScore   = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
 *   finalScore = rawScore × attentionMultiplier
 *   recency    = max(0.1, (1 + t)^−0.5),  t = days since last_accessed
 *
 * Defensive: tDays clamped to ≥0 so future last_accessed values cannot produce
 * negative tDays → NaN in Math.pow (F1 guard).
 * Never-accessed facts use tDays=Infinity → recency floors to 0.1 (treated as
 * very stale, not just-accessed — F3 semantics).
 */
export function compositeScore(fact: RecallResult, nowMs: number): number {
  const relevance  = fact.relevance  ?? 0;
  const importance = fact.importance ?? 0;

  // F1: clamp to ≥0 — future last_accessed values yield negative tDays → NaN without this guard.
  // F3: absent last_accessed → Infinity → recency floors to 0.1 (never-accessed treated as very stale, not just-accessed).
  const tDays = typeof fact.last_accessed === 'number'
    ? Math.max(0, (nowMs - fact.last_accessed) / 86_400_000)
    : Infinity;
  const recency = Math.max(0.1, Math.pow(1 + tDays, -0.5));

  const rawScore = 0.50 * relevance + 0.20 * importance + 0.20 * fact.trust + 0.10 * recency;
  const multiplier = ATTENTION_MULTIPLIERS[fact.attention_tier];
  return rawScore * multiplier;
}

/**
 * Retrieve the top k memory entries matching `query`, filtered by trust floor
 * and ranked by FR-2 composite formula descending (§30 §1.2). Returns each
 * fact paired with its composite score.
 *
 * Use this when score transparency or downstream re-ranking is needed.
 * `recall` is the convenience wrapper that strips scores.
 *
 * Not yet implemented (future red beats):
 *   - lastAccessedAt / accessCount side effects (§10 §10.1)
 *   - Trust score updates from feedback (§30 §2.1)
 */
export async function recallWithScores(
  options: RecallOptions,
  deps: RecallDeps,
): Promise<ScoredResult[]> {
  const { query, sessionId, k } = options;
  const { factStore, clock, ranker } = deps;

  const candidates = await factStore.search({ query, sessionId, limit: k, minTrust: TRUST_FLOOR });
  const nowMs = clock.now();

  // Belt-and-suspenders: FactStore.search() now receives minTrust and filters at the data
  // layer per §20 §7.4 (F6). This post-filter remains as defense-in-depth — if a FactStore
  // mock or future implementation does not honor minTrust, no below-floor facts reach the ranker.
  const trusted = candidates.filter(f => f.trust >= TRUST_FLOOR);
  const scored = ranker
    ? ranker(trusted, { nowMs })
    : trusted.map(f => ({ fact: f, score: compositeScore(f, nowMs) }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Convenience wrapper around `recallWithScores` — strips scores and returns facts only.
 * Use `recallWithScores` when score values are needed (debugging, reranking pipelines).
 */
export async function recall(
  options: RecallOptions,
  deps: RecallDeps,
): Promise<RecallResult[]> {
  return (await recallWithScores(options, deps)).map(s => s.fact);
}
