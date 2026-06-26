/**
 * Stub SDK provider — Phase 0.5 walking skeleton (T4, SK-1).
 *
 * Implements SdkProvider with fully deterministic, canned responses:
 * same prompt → same TurnResult byte-for-byte. No timestamps, no randomness.
 * This proves the L0 boundary is live without requiring a real model.
 *
 * @see docs/crucible-technical-design/12-copilot-sdk-integration.md §12.2
 */

import type {
  SdkProvider,
  BootstrapOptions,
  BootstrapPayload,
  TurnResult,
} from './types.js';
import type { PrimitiveInput } from '../types.js';

/** Schema version this stub targets. */
const STUB_SCHEMA_VERSION = 1;

/**
 * Deterministic djb2 hash of a string, returned as a stable hex string.
 * Pure function: same input → same output, no external state.
 */
function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // djb2: h = h * 33 ^ c  (keep within 32-bit unsigned)
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * StubSdkProvider — deterministic mock of the Copilot SDK L0 adapter.
 *
 * SK-1 contract: bootstrap() + completeTurn() together prove the L0 boundary
 * is live. The TurnResult from completeTurn() always contains exactly one
 * Observation PrimitiveInput and one Decision PrimitiveInput (satisfying the
 * SK-3 commitment requirement of ≥1 Observation + ≥1 Decision).
 *
 * This is a Phase-0.5 walking-skeleton stub, not the real §12 provider.
 * Consumers import via the skeleton barrel: `@akubly/crucible-core/skeleton`
 * or relative path `../skeleton/index.js`.
 */
export class StubSdkProvider implements SdkProvider {
  readonly id = 'stub-sdk@1';
  readonly sdkVersion = '0.0.0-stub';

  /**
   * Open a stub session and build a BootstrapPayload.
   *
   * literalContext is assembled directly from the caller's opts.
   * memoryManifest is always empty for the skeleton.
   */
  async bootstrap(opts: BootstrapOptions): Promise<BootstrapPayload> {
    return {
      sessionId: opts.sessionId,
      sdkVersion: this.sdkVersion,
      schemaVersion: STUB_SCHEMA_VERSION,
      literalContext: {
        systemPrompt: opts.systemPrompt,
        toolDefinitions: opts.toolDefinitions,
        injectedMemoryFragments: opts.injectedMemoryFragments ?? [],
      },
      memoryManifest: [],
    };
  }

  /**
   * Execute a deterministic stub turn.
   *
   * The canned response is a pure function of the prompt via djb2Hex so that
   * byte-equivalent replay (SK-5) holds unconditionally.
   *
   * primitives[0] — Observation: records the model's response content.
   * primitives[1] — Decision: records the routing decision derived from the
   *   prompt hash, satisfying the SK-3 ≥1 Observation + ≥1 Decision contract.
   */
  async completeTurn(prompt: string): Promise<TurnResult> {
    const promptHash = djb2Hex(prompt);
    const responseText = `stub-response:${promptHash}`;

    const observationRow: PrimitiveInput = {
      primitiveKind: 'observation',
      primitivePayload: {
        source: 'stub-sdk',
        content: responseText,
        promptHash,
      },
      causalReadSet: [],
    };

    const decisionRow: PrimitiveInput = {
      primitiveKind: 'decision',
      primitivePayload: {
        source: 'stub-sdk',
        action: 'passthrough',
        rationale: `stub decision for prompt hash ${promptHash}`,
      },
      causalReadSet: [promptHash],
    };

    return {
      responsePayload: responseText,
      primitives: [observationRow, decisionRow],
    };
  }

  /** Idempotent no-op. */
  async shutdown(_reason: string): Promise<void> {
    // Nothing to release in the stub.
  }
}
