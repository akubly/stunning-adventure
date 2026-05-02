/**
 * Type assertion helpers — verify CairnBridgeEvent shape conformance
 * at runtime. Used to validate that the Forge event bridge produces
 * well-formed bridge events.
 */
import type { CairnBridgeEvent, ProvenanceTier } from '@akubly/types';

const VALID_PROVENANCE_TIERS: ReadonlySet<ProvenanceTier> = new Set([
  'internal',
  'certification',
  'deployment',
]);

/**
 * Assert that an object conforms to the CairnBridgeEvent shape.
 * Throws with a descriptive message on failure.
 */
export function assertIsCairnBridgeEvent(
  value: unknown,
): asserts value is CairnBridgeEvent {
  if (value == null || typeof value !== 'object') {
    throw new Error(`Expected CairnBridgeEvent object, got ${typeof value}`);
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.sessionId !== 'string' || obj.sessionId.length === 0) {
    throw new Error(
      `CairnBridgeEvent.sessionId must be a non-empty string, got: ${JSON.stringify(obj.sessionId)}`,
    );
  }

  if (typeof obj.eventType !== 'string' || obj.eventType.length === 0) {
    throw new Error(
      `CairnBridgeEvent.eventType must be a non-empty string, got: ${JSON.stringify(obj.eventType)}`,
    );
  }

  if (typeof obj.payload !== 'string') {
    throw new Error(
      `CairnBridgeEvent.payload must be a string, got: ${typeof obj.payload}`,
    );
  }

  if (typeof obj.createdAt !== 'string' || obj.createdAt.length === 0) {
    throw new Error(
      `CairnBridgeEvent.createdAt must be a non-empty string, got: ${JSON.stringify(obj.createdAt)}`,
    );
  }

  if (!VALID_PROVENANCE_TIERS.has(obj.provenanceTier as ProvenanceTier)) {
    throw new Error(
      `CairnBridgeEvent.provenanceTier must be one of ${[...VALID_PROVENANCE_TIERS].join(', ')}, got: ${JSON.stringify(obj.provenanceTier)}`,
    );
  }
}

/**
 * Non-throwing check — returns true if value looks like a CairnBridgeEvent.
 */
export function isCairnBridgeEvent(value: unknown): value is CairnBridgeEvent {
  try {
    assertIsCairnBridgeEvent(value);
    return true;
  } catch {
    return false;
  }
}
