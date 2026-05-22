/**
 * L5 — ChangeVectorSummary.category regression guard (Phase 4.6 cycle 2, Finding #7).
 *
 * ChangeVectorSummary now comes from @akubly/types, where `category` is the canonical
 * OptimizationCategory union. Cairn narrows raw SQLite strings at the read boundary in
 * `getAllCategories()`, so summaries and providers only surface valid categories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { getAllCategories, insertChangeVector, summarizeChangeVectors } from '../db/changeVectors.js';
import { insertOptimizationHint } from '../db/optimizationHints.js';
import type { OptimizationCategory } from '@akubly/types';

// ---------------------------------------------------------------------------
// Canonical set of valid OptimizationCategory values (mirrors forge's union).
// TypeScript enforces this array only contains members of OptimizationCategory,
// so if the union changes in forge, this array will produce a type error.
// ---------------------------------------------------------------------------

const VALID_OPTIMIZATION_CATEGORIES: readonly OptimizationCategory[] = [
  'prompt-structure',
  'tool-guidance',
  'context-management',
  'cache-optimization',
  'model-selection',
  'convergence',
];

function isValidOptimizationCategory(cat: string): cat is OptimizationCategory {
  return (VALID_OPTIMIZATION_CATEGORIES as readonly string[]).includes(cat);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let hintCounter = 0;

function makeHintId(category: string): string {
  hintCounter += 1;
  return insertOptimizationHint({
    id: `hint-cat-reg-${hintCounter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-reg',
    category,
    description: 'Category regression test hint',
    recommendation: 'none',
    generatedAt: '2026-05-03T20:59:53.000Z',
    status: 'applied',
    metricSnapshot: {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    },
  });
}

beforeEach(() => {
  closeDb();
  hintCounter = 0;
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Category regression tests
// ---------------------------------------------------------------------------

describe('summarizeChangeVectors — category is a valid OptimizationCategory member', () => {
  it('category returned equals the valid OptimizationCategory value it was stored with', () => {
    // Guard: for each valid OptimizationCategory, assert that summarizeChangeVectors
    // returns it unchanged. If forge ever renames a category, this test will fail
    // because the stored string will no longer be in VALID_OPTIMIZATION_CATEGORIES.
    const db = getDb();
    const categoriesToTest: OptimizationCategory[] = [
      'convergence',
      'prompt-structure',
      'cache-optimization',
    ];

    for (const category of categoriesToTest) {
      const hintId = makeHintId(category);
      insertChangeVector(db, {
        hintId,
        deltas: { deltaDrift: -0.1, deltaCost: -10_000, deltaSuccessRate: 0.1, deltaConvergence: -2, deltaCacheHit: 0.1 },
        sessionsObserved: 3,
        computedAt: '2026-05-03T20:59:53.000Z',
      });

      const summary = summarizeChangeVectors(db, category, 'skill-reg');
      expect(summary.category).toBe(category);
      expect(isValidOptimizationCategory(summary.category)).toBe(true);
    }
  });

  it('all valid OptimizationCategory members are recognized by the validator', () => {
    // Meta-test: ensure the validator correctly identifies all valid categories.
    // If forge adds a new category that isn't in this list, this test will still pass
    // (validator is lenient on extras), but the VALID_OPTIMIZATION_CATEGORIES array
    // would get a TypeScript error if it contained an unknown member.
    for (const cat of VALID_OPTIMIZATION_CATEGORIES) {
      expect(isValidOptimizationCategory(cat)).toBe(true);
    }
  });

  it('getAllCategories filters invalid category strings at the DB boundary', () => {
    const db = getDb();
    makeHintId('not-a-real-category');
    makeHintId('convergence');

    expect(getAllCategories(db, 'skill-reg')).toEqual(['convergence']);
  });

  it('categories from all valid OptimizationCategory members round-trip through DB unchanged', () => {
    // Full coverage: every valid category value survives insert → summarize unchanged.
    const db = getDb();

    for (const category of VALID_OPTIMIZATION_CATEGORIES) {
      // Use a unique skillId per category to avoid cross-category interference
      const skillId = `skill-roundtrip-${category}`;
      const hintId = insertOptimizationHint({
        id: `hint-rt-${category}`,
        source: 'prompt-optimizer',
        skillId,
        category,
        description: 'Roundtrip test',
        recommendation: 'none',
        generatedAt: '2026-05-03T20:59:53.000Z',
        status: 'applied',
        metricSnapshot: { driftScore: 0.2 },
      });
      insertChangeVector(db, {
        hintId,
        deltas: { deltaDrift: -0.05, deltaCost: 0, deltaSuccessRate: 0.05, deltaConvergence: -1, deltaCacheHit: 0 },
        sessionsObserved: 3,
        computedAt: '2026-05-03T20:59:53.000Z',
      });

      const summary = summarizeChangeVectors(db, category, skillId);
      expect(summary.category).toBe(category);
      expect(isValidOptimizationCategory(summary.category)).toBe(true);
    }
  });
});
