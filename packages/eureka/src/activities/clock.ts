/**
 * ClockProvider — shared clock seam for all Eureka activities, injected for
 * deterministic timestamps in tests.
 *
 * @remarks
 * Neutral location: both recall.ts and imprint.ts import from here, which
 * avoids the write-path (imprint) depending on the read-path (recall) module.
 *
 * Unit: milliseconds (consistent with existing impl; §30 §2.4 spec uses seconds —
 * §-tension flagged in laura-m4-clock-red decision drop).
 */
export interface ClockProvider {
  /** Returns current Unix timestamp in milliseconds. */
  now(): number;
}
