/**
 * ClockProvider — shared clock seam for all Eureka activities.
 *
 * Neutral location: both recall.ts and imprint.ts import from here.
 * Avoids write-path (imprint) depending on read-path (recall) module.
 */

/**
 * Clock seam — injected for deterministic timestamps in tests.
 *
 * Unit: milliseconds (consistent with existing impl; §30 §2.4 spec uses seconds —
 * §-tension flagged in laura-m4-clock-red decision drop).
 */
export interface ClockProvider {
  /** Returns current Unix timestamp in milliseconds. */
  now(): number;
}
