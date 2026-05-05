/**
 * Bridge ↔ collectors contract test.
 *
 * Collectors react to a fixed set of Cairn event-type strings. Those strings
 * MUST appear in the bridge's `EVENT_MAP` — otherwise collectors silently
 * receive nothing in production and we get a phantom-zero telemetry stream.
 *
 * This test enumerates every value in `COLLECTOR_BRIDGE_EVENTS` and asserts
 * it is also a value of `EVENT_MAP`. If you add a new event the collectors
 * care about, add it to both places (or this test fails fast).
 */

import { describe, it, expect } from "vitest";
import { COLLECTOR_BRIDGE_EVENTS } from "../telemetry/collectors.js";
import { EVENT_MAP } from "../bridge/index.js";

describe("collectors ↔ bridge event-name contract", () => {
  const bridgeValues = new Set(Object.values(EVENT_MAP));

  for (const [alias, eventName] of Object.entries(COLLECTOR_BRIDGE_EVENTS)) {
    it(`bridge EVENT_MAP emits "${eventName}" (used by collectors as ${alias})`, () => {
      expect(bridgeValues.has(eventName)).toBe(true);
    });
  }

  it("COLLECTOR_BRIDGE_EVENTS is a non-empty frozen object", () => {
    expect(Object.isFrozen(COLLECTOR_BRIDGE_EVENTS)).toBe(true);
    expect(Object.keys(COLLECTOR_BRIDGE_EVENTS).length).toBeGreaterThan(0);
  });
});
