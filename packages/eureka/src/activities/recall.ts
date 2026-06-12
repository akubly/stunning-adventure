/**
 * recall — retrieve top-k relevant facts from memory.
 *
 * Activity: recall (§10 §10.1)
 * Seam:     FactStore.search() — injected via deps (§20 §7.4, §55 §2.1)
 * AC:       AC-1.3 keyword-scoped recall at ≥80% precision
 * AC-FR-2:  Composite-ranker ordering (§30 §1.2)
 */

import type { SessionId } from '@akubly/types';
import {
  InvalidFeedbackOptionsError,
  InvalidTrustValueError,
  UnhandledFeedbackEventError,
} from './errors.js';

/** Minimal fact shape returned from FactStore.search() at the storage seam. */
export interface RecallResult {
  content: string;
  trust: number;
  attentionTier: 'hot' | 'warm' | 'cold';
  /** Pure BM25 text-match quality, normalized per-page to [0,1] (min-max).
   *
   * **Independent of result/page order.** Page ordering uses the composite
   * heuristic `(-bm25) × trust`; relevance is `(-bm25)` only (no trust factor).
   * A high-trust/low-BM25 fact can sort ahead of a low-trust/high-BM25 fact
   * while carrying a LOWER relevance — this is by design, not a bug.
   *
   * **Per-page only.** Min-max is computed across the current page; a sole
   * result on a sparse last page always receives 1.0. NOT comparable across
   * pages — treat as an intra-page ranking signal only. */
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

/**
 * FactStore seam — injected, never instantiated here (§55 §2.1 London form).
 *
 * @remarks Keyset cursor pagination (Slice D++): cursors encode the composite
 * score and row id of the last returned row. This eliminates the OFFSET-shift
 * duplication/skip mechanism (FSE-2): a higher-ranked insert between pages can
 * no longer shift rows so that a previously-returned row re-appears or a row is
 * silently skipped. This is NOT a blanket concurrent-insert safety guarantee —
 * the SQLite implementation has a documented IDF-drift caveat (see SqliteFactStore)
 * for a residual second-order insert-boundary effect where bm25() IDF recomputation
 * can perturb the composite boundary. Trust mutations of already-returned rows can
 * still cause re-appearance — callers needing strict stability under concurrent
 * trust writes should restart pagination. Per-page relevance normalization (D3) is
 * unchanged — relevance is not comparable across pages.
 */
export interface FactStore {
  search(args: {
    query: string;
    sessionId: SessionId;
    /**
     * Number of results per page.
     *
     * @throws {TypeError} Throws if `limit` is not a positive integer.
     * Degenerate values (≤ 0, NaN, non-integer) are rejected at the call boundary
     * and treated as contract violations, not as empty-result requests.
     */
    limit: number;
    /** Trust floor predicate per §20 §7.4 — store applies WHERE trust >= minTrust. Default 0.15. */
    minTrust?: number;
    /**
     * Opaque pagination cursor returned by a prior search call.
     * Absent on first page. Consumers MUST NOT parse cursor internals.
     * Q2-locked: included now to avoid a breaking change when cross-session queries arrive.
     *
     * @throws {CursorScopeMismatchError} Throws if a v1 cursor's scope fingerprint does
     * not match the current search parameters (query/sessionId/minTrust/limit). This
     * indicates the cursor was obtained from a different search context and cannot be
     * safely reused. Callers that intentionally restart pagination may catch and retry
     * from page 0 (no cursor). Both error classes are exported from `@akubly/eureka/sqlite`;
     * callers who prefer not to import the class may catch by `.code` discriminator
     * (`'CURSOR_SCOPE_MISMATCH'` / `'CURSOR_VERSION_UNSUPPORTED'`).
     *
     * @throws {CursorVersionUnsupportedError} Throws if the cursor carries a `v` field
     * with an unsupported version value — any present `v` that is not exactly 1,
     * including v:0, floats, strings, and any future version the implementation does
     * not recognise. Completely unparseable cursors fall back to a page-1 restart (no throw).
     * Exported from `@akubly/eureka/sqlite`.
     */
    cursor?: string;
  }): Promise<{
    results: RecallResult[];
    /**
     * Opaque cursor for the next page. Absent when no further results exist.
     * Consumers MUST NOT parse cursor internals.
     *
     * @note `results[].relevance` is pure BM25 text-match quality, normalized
     *   per-page (min-max across THIS page only). Page ORDER is determined by
     *   the composite heuristic `(-bm25) × trust`; relevance does NOT control
     *   order and is NOT comparable across pages. Treat as intra-page signal only.
     */
    nextCursor?: string;
  }>;
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
  /** Optional logger for attention-tier warnings; defaults to console. */
  logger?: { warn(msg: string): void };
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
  const logger = deps.logger ?? console;

  // C4: Validate k at the entry point.
  // k === 0: valid — return [] without touching factStore (avoids SQLite limit:0 edge cases).
  // Non-finite (NaN, ±Infinity), non-integer (1.5), or negative: programming error.
  if (k === 0) return [];
  if (!Number.isFinite(k) || !Number.isInteger(k) || k < 0) {
    throw new TypeError(`recall: k must be a positive integer, got ${k}`);
  }

  // C3: Overfetch so the post-BM25 ranker has a meaningful candidate set to reorder.
  const { results: candidates } = await factStore.search({ query, sessionId, limit: k * RANKER_OVERFETCH_FACTOR, minTrust: TRUST_FLOOR });
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
    logger.warn(
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
 *
 * M7-C atomicity contract:
 *   The storage implementation MUST execute the read, fn-application, and write as a
 *   single atomic operation with respect to other `mutate()` calls on the **same
 *   (sessionId, factId) pair**. Calls for different pairs may proceed concurrently.
 *
 *   Storage MUST scope state by `(sessionId, factId)`. A `mutate()` on one `sessionId`
 *   MUST NOT observe or mutate state belonging to a different `sessionId`.
 *
 *   - If `fn` throws: the write is aborted; no partial state is committed; the error
 *     propagates out of `mutate()` unchanged.
 *   - If the fact does not exist: `mutate()` MUST throw `FactNotFoundError(factId)` before
 *     calling `fn`. `fn` is never invoked for a missing fact.
 *   - If `fn` returns a non-finite or out-of-range [0, 1] value: storage MUST reject by
 *     throwing `InvalidTrustValueError(value, 'storage', ...)`. This clause is normative —
 *     implementations MUST NOT silently commit a corrupt trust value.
 *
 * Production implementation delegates to the persistence/storage layer (e.g., a future
 * FactStore extension or dedicated writer interface — the FactStore interface here is read-only).
 */
export interface TrustUpdater {
  mutate(args: {
    factId: string;
    sessionId: SessionId;
    /** Pure delta function — sync. Receives currentTrust from storage; returns newTrust.
     *  Throw `InvalidTrustValueError(currentTrust, 'storage', ...)` for corrupt input.
     *  Clamping to [0,1] is performed inside fn by the activity layer.
     */
    fn: (currentTrust: number) => number;
  }): Promise<void>;
}

/**
 * Read-seam for current fact trust (M6-B — higher-level orchestrator seam).
 * Separates the read responsibility from the write responsibility per London-school
 * single-responsibility: applyFeedback owns delta computation; FactReader owns the read.
 */
export interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}

/**
 * Named options type for applyFeedback (M1–M4 named-type pattern).
 *
 * M7-C: `currentTrust` removed — it is now the argument to the `fn` passed to
 * `TrustUpdater.mutate()`, supplied by the storage layer rather than the caller.
 */
export interface ApplyFeedbackOptions {
  factId: string;
  sessionId: SessionId;
  event: FeedbackEvent;
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

/**
 * Named deps type for applyFeedbackById.
 *
 * M7-C: `factReader` removed — the read is now performed atomically inside
 * `TrustUpdater.mutate()`. `applyFeedbackById` is a thin forwarding wrapper.
 */
export interface ApplyFeedbackByIdDeps {
  trustUpdater: TrustUpdater;
}

/**
 * Apply a feedback event to a fact, mutating trust via the `TrustUpdater.mutate` seam
 * (§30 §2.3 "Trust Dynamics Beyond the Static Floor"). The storage implementation owns the
 * atomic read-modify-write; the activity layer owns the delta computation:
 *   Corroboration:   trust = min(1.0, trust + 0.10)
 *   Contradiction:   trust = max(0.0, trust - 0.10)
 *   User correction: trust = min(1.0, max(0.0, trust + correctionDelta))
 *
 * M7-C: `currentTrust` is no longer a caller input — it is the argument to the `fn`
 * closure supplied to `mutate()`, read atomically by the storage layer.
 *
 * Validation order (all input checks fire before the first `await`):
 *   1. Pre-flight event switch — throws `UnhandledFeedbackEventError` for unknown events
 *   2. user_correction: missing correctionDelta → `InvalidFeedbackOptionsError`
 *   3. user_correction: non-finite correctionDelta → `InvalidTrustValueError(source:'input')`
 *   Then: build `fn`, call `mutate()`.
 *   Inside fn (called by storage): non-finite/out-of-range currentTrust →
 *     `InvalidTrustValueError(source:'storage')` — write is aborted.
 *
 * @concurrency Atomicity is a CONTRACT guarantee of `TrustUpdater.mutate()`:
 *   the storage implementation MUST execute read + fn + write as a single atomic operation
 *   per (sessionId, factId) pair. See `.squad/decisions.md` § "M7-C Atomicity Contract" (PR #41) and
 *   TrustUpdater JSDoc for the full contract.
 *
 * @throws {UnhandledFeedbackEventError} if an unrecognised FeedbackEvent variant is encountered at runtime
 * @throws {InvalidFeedbackOptionsError} if event='user_correction' and correctionDelta is omitted
 * @throws {InvalidTrustValueError} if event='user_correction' and correctionDelta is non-finite (source:'input')
 * @throws {FactNotFoundError} propagated from mutate() if the fact does not exist in storage
 * @throws {InvalidTrustValueError} propagated from fn if storage provides a corrupt currentTrust (source:'storage')
 */
export async function applyFeedback(
  options: ApplyFeedbackOptions,
  deps: ApplyFeedbackDeps,
): Promise<void> {
  const { factId, sessionId, event, correctionDelta } = options;
  const { trustUpdater } = deps;

  // All input validation fires before the first await (§55 contract invariant).
  switch (event) {
    case 'corroboration':
    case 'contradiction':
      break;
    case 'user_correction':
      if (correctionDelta === undefined) {
        throw new InvalidFeedbackOptionsError(
          'correctionDelta',
          'applyFeedback: correctionDelta is required when event is "user_correction"',
        );
      }
      if (!Number.isFinite(correctionDelta)) {
        // TODO(M7-B): correctionDelta error should use a purpose-specific type (e.g. InvalidDeltaValueError)
        throw new InvalidTrustValueError(
          correctionDelta,
          'input',
          `applyFeedback: correctionDelta must be a finite number; received ${correctionDelta}`,
        );
      }
      break;
    default: {
      const _exhaustive: never = event;
      throw new UnhandledFeedbackEventError(_exhaustive);
    }
  }

  // Build the mutation fn. Validates storage-provided currentTrust (source:'storage')
  // and computes the clamped newTrust. If fn throws, mutate() aborts the write.
  const fn = (currentTrust: number): number => {
    if (!Number.isFinite(currentTrust) || currentTrust < 0 || currentTrust > 1) {
      throw new InvalidTrustValueError(
        currentTrust,
        'storage',
        `applyFeedback: stored trust is non-finite or out of [0,1] — factId="${factId}", trust=${currentTrust}`,
      );
    }
    switch (event) {
      case 'corroboration':
        return Math.min(1.0, currentTrust + 0.10);
      case 'contradiction':
        return Math.max(0.0, currentTrust - 0.10);
      case 'user_correction':
        return Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta!));
      default: {
        // Unreachable at runtime — pre-flight switch above rejects unknown events.
        // Retained for TypeScript exhaustiveness guarantee on FeedbackEvent union.
        const _exhaustive: never = event;
        throw new UnhandledFeedbackEventError(_exhaustive);
      }
    }
  };

  await trustUpdater.mutate({ factId, sessionId, fn });
}

/**
 * Higher-level orchestrator: delegates entirely to `applyFeedback` via the
 * `TrustUpdater.mutate` seam. The storage implementation reads currentTrust,
 * applies the delta function, and writes atomically — no separate FactReader call.
 *
 * M7-C: `FactReader` is no longer used on the feedback-write path. FactReader
 * survives in the codebase for pure-read use cases (recall, display). The read
 * is now owned by the storage implementation inside `mutate()`.
 *
 * @concurrency See `applyFeedback` @concurrency note — atomicity is a contract
 *   guarantee of `TrustUpdater.mutate()`.
 *
 * @throws {UnhandledFeedbackEventError} propagated from applyFeedback if event is an unrecognized variant
 * @throws {InvalidFeedbackOptionsError} propagated from applyFeedback if event='user_correction' and correctionDelta is omitted
 * @throws {InvalidTrustValueError} propagated from applyFeedback if correctionDelta is non-finite (source:'input')
 * @throws {FactNotFoundError} propagated from mutate() if the fact does not exist in storage
 * @throws {InvalidTrustValueError} propagated from fn if storage provides corrupt currentTrust (source:'storage')
 */
export async function applyFeedbackById(
  options: ApplyFeedbackByIdOptions,
  deps: ApplyFeedbackByIdDeps,
): Promise<void> {
  const { factId, sessionId, event, correctionDelta } = options;
  const { trustUpdater } = deps;
  await applyFeedback({ factId, sessionId, event, correctionDelta }, { trustUpdater });
}
