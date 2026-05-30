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
  attention_tier: string;
  /** Normalized BM25 relevance score ∈ [0,1] returned by FactStore.search(). */
  relevance?: number;
  /** Importance signal ∈ [0,1]. */
  importance?: number;
  /** Unix epoch ms — used to compute query-time recency (§30 §1.2). */
  last_accessed?: number;
  [key: string]: unknown;
}

/** FactStore seam — injected, never instantiated here (§55 §2.1 London form). */
export interface FactStore {
  search(args: { query: string; sessionId: SessionId; limit: number }): Promise<RecallResult[]>;
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

export interface RecallDeps {
  factStore: FactStore;
  /**
   * Clock provider for query-time recency (§30 §2.4).
   * REQUIRED — no optional default; defaults hide non-determinism per §55 §1.2.
   * §-tension: §30 §2.4 suggests optional default to SystemClock; §55 §1.2 prohibits.
   */
  clock: ClockProvider;
}

/** Trust floor per §30 §2.3 — exclude facts below this threshold. */
const TRUST_FLOOR = 0.15;

/**
 * Attention multipliers per §30 §1.2 (FR-2 canonical ranker formula).
 * §50 line 211 contains incorrect values (hot=1.0/warm=0.5/cold=0.1) —
 * §30 §1.2 is the authoritative source; §50 cleanup is Crispin/Genesta's call.
 */
const ATTENTION_MULTIPLIERS: Record<string, number> = {
  hot:  1.20,
  warm: 1.00,
  cold: 0.80,
};

/**
 * FR-2 composite score (§30 §1.2):
 *   rawScore   = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
 *   finalScore = rawScore × attentionMultiplier
 *   recency    = max(0.1, (1 + t)^−0.5),  t = days since last_accessed
 */
function compositeScore(fact: RecallResult, nowMs: number): number {
  const relevance  = fact.relevance  ?? 0;
  const importance = fact.importance ?? 0;

  const tDays = typeof fact.last_accessed === 'number'
    ? (nowMs - fact.last_accessed) / 86_400_000
    : 0;
  const recency = Math.max(0.1, Math.pow(1 + tDays, -0.5));

  const rawScore = 0.50 * relevance + 0.20 * importance + 0.20 * fact.trust + 0.10 * recency;
  const multiplier = ATTENTION_MULTIPLIERS[fact.attention_tier] ?? 1.00;
  return rawScore * multiplier;
}

/**
 * Retrieve the top k memory entries matching `query`, filtered by trust floor
 * and ranked by FR-2 composite formula descending (§30 §1.2).
 *
 * Not yet implemented (future red beats):
 *   - Recency-gradient decay over time (ClockProvider seam — §30 §2.4)
 *   - lastAccessedAt / accessCount side effects (§10 §10.1)
 *   - Trust score updates from feedback (§30 §2.1)
 */
export async function recall(
  options: RecallOptions,
  deps: RecallDeps,
): Promise<RecallResult[]> {
  const { query, sessionId, k } = options;
  const { factStore, clock } = deps;

  const candidates = await factStore.search({ query, sessionId, limit: k });
  const nowMs = clock.now();

  return candidates
    .filter(f => f.trust >= TRUST_FLOOR)
    .map(f => ({ fact: f, score: compositeScore(f, nowMs) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(s => s.fact);
}
