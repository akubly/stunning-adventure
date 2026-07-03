/**
 * imprint — commit a new fact to durable memory.
 *
 * Activity: imprint (FR-4 amended vocabulary)
 * Seam:     FactWriter.write() — injected via deps (§55 §2.1)
 * AC:       AC-1.1 fact storage during familiarization
 *
 * This is the raw write path. It validates input, applies defaults,
 * generates a FactId, and delegates to FactWriter. It performs NO
 * contextual processing — that is integrate's job.
 */

import type { SessionId, FactId } from '@akubly/types';
import type { ClockProvider } from './clock.js';
import { InvalidImprintError } from './errors.js';

// Re-export ClockProvider so consumers can import from this module.
export type { ClockProvider } from './clock.js';

/**
 * Opaque fact identifier. UUID v4 string branded for type safety.
 *
 * Canonical home is `@akubly/types` (D-R1 layering review — keeps the
 * identity type out of the activities layer so representation/storage
 * consumers can import it without depending on activities). Re-exported
 * here for backward compatibility with existing imprint consumers.
 */
export type { FactId };

/** Attention tier literal union (matches migration 002 CHECK constraint). */
export type AttentionTier = 'hot' | 'warm' | 'cold';

/**
 * Write-seam for fact persistence (§55 §2.1 London form).
 *
 * Implementations: SqliteFactWriter, InMemoryFactWriter.
 * Verified by: runFactWriterContract() shared suite.
 *
 * Contract guarantees:
 * - write() MUST persist the fact durably before resolving.
 * - write() MUST be idempotent on (factId, sessionId): first write wins.
 * - write() MUST scope state by sessionId.
 * - write() receives fully-validated, defaulted values.
 * - write() sets `last_accessed` to NULL (never accessed yet).
 */
export interface FactWriter {
  write(args: {
    factId: FactId;
    sessionId: SessionId;
    content: string;
    trust: number;
    importance: number;
    attentionTier: AttentionTier;
    /** Unix epoch milliseconds — from injected ClockProvider. */
    createdAt: number;
  }): Promise<void>;
}

/**
 * Input shape for the imprint activity.
 * Required: content + sessionId. Optional: trust, importance, attentionTier.
 */
export interface ImprintOptions {
  /** Searchable text content. Must be non-empty after trim. */
  content: string;
  /** Session scope. All v1 facts are scoped to a session. */
  sessionId: SessionId;
  /**
   * Initial trust score ∈ [0, 1].
   * Default: 0.5 (neutral — neither trusted nor distrusted).
   */
  trust?: number;
  /**
   * Initial importance score ∈ [0, 1].
   * Default: 0 (unscored — matches schema DEFAULT from migration 002).
   */
  importance?: number;
  /**
   * Initial attention tier.
   * Default: 'warm' (matches schema DEFAULT from migration 002).
   */
  attentionTier?: AttentionTier;
}

/**
 * UUID generation seam. Injected for deterministic IDs in tests.
 * Production: crypto.randomUUID() wrapped as FactId.
 */
export interface IdProvider {
  /** Returns a new unique FactId. */
  next(): FactId;
}

/**
 * Deps injected into the imprint activity (London-school seam pattern).
 */
export interface ImprintDeps {
  /** Write seam — injected, never instantiated by the activity. */
  factWriter: FactWriter;
  /** Clock for createdAt timestamp. */
  clock: ClockProvider;
  /** UUID generator seam. */
  idProvider: IdProvider;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_TIERS: ReadonlySet<string> = new Set(['hot', 'warm', 'cold']);

function validateOptions(options: ImprintOptions, trimmed: string): void {
  // V1: content must be non-empty after trim
  if (trimmed.length === 0) {
    throw new InvalidImprintError(
      'content',
      options.content,
      'imprint: content must be non-empty after trimming',
    );
  }

  // V2: trust (if provided) must be finite and in [0, 1]
  if (options.trust !== undefined) {
    if (!Number.isFinite(options.trust) || options.trust < 0 || options.trust > 1) {
      throw new InvalidImprintError(
        'trust',
        options.trust,
        'imprint: trust must be a finite number in [0, 1]',
      );
    }
  }

  // V3: importance (if provided) must be finite and in [0, 1]
  if (options.importance !== undefined) {
    if (!Number.isFinite(options.importance) || options.importance < 0 || options.importance > 1) {
      throw new InvalidImprintError(
        'importance',
        options.importance,
        'imprint: importance must be a finite number in [0, 1]',
      );
    }
  }

  // V4: attentionTier (if provided) must be 'hot' | 'warm' | 'cold'
  if (options.attentionTier !== undefined) {
    if (!VALID_TIERS.has(options.attentionTier)) {
      throw new InvalidImprintError(
        'attentionTier',
        options.attentionTier,
        'imprint: attentionTier must be hot, warm, or cold',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Activity function
// ---------------------------------------------------------------------------

/**
 * imprint — commit a new fact to durable memory.
 *
 * Validation fires synchronously BEFORE the first await (matches applyFeedback pattern).
 *
 * @returns FactId — the generated identifier for the newly imprinted fact.
 * @throws {InvalidImprintError} if any input validation fails (code: 'INVALID_IMPRINT')
 */
export async function imprint(
  options: ImprintOptions,
  deps: ImprintDeps,
): Promise<FactId> {
  // Validation — synchronous, before any async work
  const trimmed = options.content.trim();
  validateOptions(options, trimmed);

  // Generate ID and timestamp
  const factId = deps.idProvider.next();

  // Guard: idProvider must return a non-empty id
  if (!(factId as string) || (factId as string).trim().length === 0) {
    throw new InvalidImprintError(
      'factId',
      factId,
      'imprint: idProvider.next() returned an empty or blank FactId',
    );
  }

  const createdAt = deps.clock.now();

  // Apply defaults
  const trust = options.trust ?? 0.5;
  const importance = options.importance ?? 0;
  const attentionTier = options.attentionTier ?? 'warm';

  // Delegate to writer
  await deps.factWriter.write({
    factId,
    sessionId: options.sessionId,
    content: trimmed,
    trust,
    importance,
    attentionTier,
    createdAt,
  });

  return factId;
}
