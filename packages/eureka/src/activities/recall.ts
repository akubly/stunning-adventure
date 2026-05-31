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
  attentionTier: 'hot' | 'warm' | 'cold';
  /** Normalized BM25 relevance score ∈ [0,1] returned by FactStore.search(). */
  relevance?: number;
  /** Importance signal ∈ [0,1]. */
  importance?: number;
  /** Unix epoch ms — used to compute query-time recency (§30 §1.2). */
  lastAccessed?: number;
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
 * Receives the trust-filtered candidate set (up to k × RANKER_OVERFETCH_FACTOR
 * candidates from FactStore.search()) and nowMs; returns the final ordered
 * ScoredResult[] for slicing. recallWithScores does NOT re-sort — the Ranker's
 * returned order is the order results are delivered to the caller.
 *
 * If a Ranker wants score-monotonic order, it must sort internally.
 * The Ranker is responsible for final ordering; recallWithScores only slices to k.
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
 * How many extra candidates we fetch beyond k so the post-BM25 ranker has
 * meaningful reordering surface. Without overfetch, the composite ranker (or any
 * custom Ranker) can only reorder within the BM25-truncated top-k; tier and trust
 * components of FR-2 are largely cosmetic relative to BM25. This resolves the
 * F6-class "ranker can only see what BM25 surfaced" concern (F6 arc closed; see
 * edgar-pr30-cycle3-c1-c4 decision drop).
 */
const RANKER_OVERFETCH_FACTOR = 3;

/**
 * Attention multipliers per §30 §1.2 (FR-2 canonical ranker formula).
 * Authoritative source: §30 §1.2.
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
 *   recency    = max(0.1, (1 + t)^−0.5),  t = days since lastAccessed
 *
 * Defensive: tDays clamped to ≥0 so future lastAccessed values cannot produce
 * negative tDays → NaN in Math.pow (F1 guard).
 * Never-accessed facts use tDays=Infinity → recency floors to 0.1 (treated as
 * very stale, not just-accessed — F3 semantics).
 * Unknown attentionTier defaults silently to 1.0 (warm-tier identity);
 * recallWithScores emits a single deduped stderr warn per call (C1).
 */
export function compositeScore(fact: RecallResult, nowMs: number): number {
  const relevance  = fact.relevance  ?? 0;
  const importance = fact.importance ?? 0;

  // F1: clamp to ≥0 — future lastAccessed values yield negative tDays → NaN without this guard.
  // F3: absent lastAccessed → Infinity → recency floors to 0.1 (never-accessed treated as very stale, not just-accessed).
  const tDays = typeof fact.lastAccessed === 'number'
    ? Math.max(0, (nowMs - fact.lastAccessed) / 86_400_000)
    : Infinity;
  const recency = Math.max(0.1, Math.pow(1 + tDays, -0.5));

  const rawScore = 0.50 * relevance + 0.20 * importance + 0.20 * fact.trust + 0.10 * recency;

  // Runtime guard: TypeScript union narrows compile-time callers, but RecallResult values
  // arrive from SQLite at runtime and may carry unrecognized tier strings (legacy casing,
  // future migration, malformed row). Unknown tier → default 1.0 (warm-tier identity).
  // recallWithScores collects unknown tiers in a per-call Set and emits ONE warn (C1).
  const multiplier = ATTENTION_MULTIPLIERS[fact.attentionTier] ?? 1.0;

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
 */
export async function recallWithScores(
  options: RecallOptions,
  deps: RecallDeps,
): Promise<ScoredResult[]> {
  const { query, sessionId, k } = options;
  const { factStore, clock, ranker } = deps;

  // C4: Validate k at the entry point.
  // k === 0: valid — return [] without touching factStore (avoids SQLite limit:0 edge cases).
  // Non-finite (NaN, ±Infinity), non-integer (1.5), or negative: programming error.
  if (k === 0) return [];
  if (!Number.isFinite(k) || !Number.isInteger(k) || k < 0) {
    throw new TypeError(`recall: k must be a positive integer, got ${k}`);
  }

  // C3: Overfetch so the post-BM25 ranker has a meaningful candidate set to reorder.
  const candidates = await factStore.search({ query, sessionId, limit: k * RANKER_OVERFETCH_FACTOR, minTrust: TRUST_FLOOR });
  const nowMs = clock.now();

  // Belt-and-suspenders: FactStore.search() now receives minTrust and filters at the data
  // layer per §20 §7.4 (F6). This post-filter remains as defense-in-depth — if a FactStore
  // mock or future implementation does not honor minTrust, no below-floor facts reach the ranker.
  const trusted = candidates.filter(f => f.trust >= TRUST_FLOOR);

  // C1: Collect unknown tier values across all trusted candidates for a single deduped warn.
  const unknownTiers = new Set<string>();
  for (const f of trusted) {
    if (ATTENTION_MULTIPLIERS[f.attentionTier] === undefined) {
      unknownTiers.add(String(f.attentionTier));
    }
  }

  // C2: Trust the Ranker's returned order — do NOT re-sort. The Ranker owns final ordering.
  // Inline path: sort descending by composite score as before.
  const scored = ranker
    ? ranker(trusted, { nowMs })
    : trusted.map(f => ({ fact: f, score: compositeScore(f, nowMs) }))
             .sort((a, b) => b.score - a.score);

  // C1: Emit ONE warn per recallWithScores call for all unrecognised tier values found.
  if (unknownTiers.size > 0) {
    console.warn(
      `[eureka.recall] Unknown attention_tier values encountered: ${[...unknownTiers].join(', ')}. Defaulted to 1.0 multiplier. Validate at FactStore boundary.`,
    );
  }

  return scored.slice(0, k);
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

// =============================================================================
// M5/M6 — Trust-feedback mutation (§30 §2.3 "Trust Dynamics Beyond the Static Floor")
// =============================================================================

/** Feedback event types per §30 §2.3. */
export type FeedbackEvent = 'corroboration' | 'contradiction' | 'user_correction';

/**
 * Write-seam for trust mutations (§55 §1.2 — storage I/O is always mocked in tests).
 * Production implementation delegates to the persistence/storage layer (e.g., a future
 * FactStore extension or dedicated writer interface — the FactStore interface here is read-only).
 */
export interface TrustUpdater {
  update(args: { factId: string; sessionId: SessionId; trust: number }): Promise<void>;
}

/**
 * Read-seam for current fact trust (M6-B — higher-level orchestrator seam).
 * Separates the read responsibility from the write responsibility per London-school
 * single-responsibility: applyFeedback owns delta computation; FactReader owns the read.
 */
export interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}

/** Named options type for applyFeedback (M1–M4 named-type pattern). */
export interface ApplyFeedbackOptions {
  factId: string;
  sessionId: SessionId;
  event: FeedbackEvent;
  currentTrust: number;
  correctionDelta?: number;
}

/** Named deps type for applyFeedback (clock removed — unused dep, non-determinism is a read concern). */
export interface ApplyFeedbackDeps {
  trustUpdater: TrustUpdater;
}

/** Named options type for applyFeedbackById (M1–M4 named-type pattern). */
export interface ApplyFeedbackByIdOptions {
  factId: string;
  sessionId: SessionId;
  event: FeedbackEvent;
  correctionDelta?: number;
}

/** Named deps type for applyFeedbackById (clock removed — unused dep). */
export interface ApplyFeedbackByIdDeps {
  factReader: FactReader;
  trustUpdater: TrustUpdater;
}

/**
 * Apply a feedback event to a fact, mutating trust by the event-driven delta (§30 §2.3):
 *   Corroboration:   trust = min(1.0, trust + 0.10)
 *   Contradiction:   trust = max(0.0, trust - 0.10)
 *   User correction: trust = min(1.0, max(0.0, trust + correctionDelta))
 *
 * The caller supplies `currentTrust`; the activity computes the new value and
 * delegates the write to the injected `TrustUpdater` seam. This function does NOT
 * read from storage — use `applyFeedbackById` when the caller doesn't know currentTrust.
 *
 * @throws {RangeError} if currentTrust is non-finite or outside [0, 1] (corrupt/buggy caller)
 * @throws {Error} if event='user_correction' and correctionDelta is omitted (programming error —
 *         a 0-delta silent fallback would call TrustUpdater for no reason and mislead callers)
 * @throws {RangeError} if event='user_correction' and correctionDelta is non-finite (NaN, ±Infinity)
 */
export async function applyFeedback(
  options: ApplyFeedbackOptions,
  deps: ApplyFeedbackDeps,
): Promise<void> {
  const { factId, sessionId, event, currentTrust, correctionDelta } = options;
  const { trustUpdater } = deps;

  if (!Number.isFinite(currentTrust) || currentTrust < 0 || currentTrust > 1) {
    throw new RangeError(
      `applyFeedback: currentTrust must be a finite number in [0, 1]; received ${currentTrust}`,
    );
  }

  let newTrust: number;

  switch (event) {
    case 'corroboration':
      newTrust = Math.min(1.0, currentTrust + 0.10);
      break;
    case 'contradiction':
      newTrust = Math.max(0.0, currentTrust - 0.10);
      break;
    case 'user_correction':
      if (correctionDelta === undefined) {
        throw new Error(
          'applyFeedback: correctionDelta is required when event is "user_correction"',
        );
      }
      if (!Number.isFinite(correctionDelta)) {
        throw new RangeError(
          `applyFeedback: correctionDelta must be a finite number; received ${correctionDelta}`,
        );
      }
      newTrust = Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta));
      break;
    default: {
      const _exhaustive: never = event;
      throw new TypeError(`applyFeedback: unhandled FeedbackEvent variant "${_exhaustive}"`);
    }
  }

  await trustUpdater.update({ factId, sessionId, trust: newTrust });
}

/**
 * Higher-level orchestrator: reads currentTrust from storage via the `FactReader` seam,
 * then delegates to `applyFeedback`. Callers do not need to supply currentTrust.
 *
 * @concurrency Non-atomic read-then-write. Two paths forward:
 *
 *   **Caller-side serialization (recommended for v1):** serialize concurrent feedback events for
 *   the same factId at the activity layer (e.g., a per-factId queue, mutex, or promise-chain in
 *   the caller). No API changes required. This is the correct approach until M7-C is scheduled.
 *
 *   **Backend-side atomicity (requires API change, deferred to M7-C):** `TrustUpdater.update`
 *   currently receives only an absolute trust value — the storage backend cannot enforce
 *   compare-and-swap without an API change. Two options under consideration for M7-C:
 *     (a) Widen `TrustUpdater.update` to accept an `expectedTrust` / version token for CAS.
 *     (b) Change the API to `mutate(factId, fn: (trust: number) => number)` — a callback-style
 *         mutation that moves the read-modify-write entirely into the storage layer.
 *   Tracked as M7-C: "atomicity contract — caller serialization vs. API widening (CAS token or
 *   mutate callback)" — the deferred RED beat is designing this contract, not just implementing
 *   storage-layer locking.
 *
 * @throws {Error} if FactReader returns null (fact not found — TrustUpdater is NOT called)
 * @throws {RangeError} if the stored fact.trust is non-finite (corrupted storage row)
 * @throws {RangeError} propagated from applyFeedback if the stored fact.trust is outside [0, 1] (corrupted storage row that survived the local non-finite check — defense in depth)
 * @throws {Error} propagated from applyFeedback if event='user_correction' and correctionDelta is omitted
 */
export async function applyFeedbackById(
  options: ApplyFeedbackByIdOptions,
  deps: ApplyFeedbackByIdDeps,
): Promise<void> {
  const { factId, sessionId, event, correctionDelta } = options;
  const { factReader, trustUpdater } = deps;

  const fact = await factReader.read({ factId, sessionId });
  if (fact === null) {
    throw new Error(`applyFeedbackById: fact not found — factId="${factId}"`);
  }
  if (fact === undefined) {
    throw new TypeError(
      `applyFeedbackById: FactReader.read() returned undefined; the contract requires {trust:number} or null — check your FactReader implementation`,
    );
  }
  if (!Number.isFinite(fact.trust)) {
    throw new RangeError(
      `applyFeedbackById: stored trust is non-finite — factId="${factId}", trust=${fact.trust}`,
    );
  }

  await applyFeedback(
    { factId, sessionId, event, currentTrust: fact.trust, correctionDelta },
    { trustUpdater },
  );
}
