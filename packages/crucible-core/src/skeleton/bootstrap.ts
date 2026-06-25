/**
 * BootstrapMaterializer implementation (SK-2, §3.8 bootstrap-batch).
 *
 * Converts a BootstrapPayload into the offset-0 Observation PrimitiveInput[]
 * that LedgerImpl.bootstrap() commits as the session's first atomic group.
 *
 * Sub-kinds produced (per §11.2 capture-scope table):
 *   - system_prompt    (1 row)  — literal system-prompt text + sdk/schema versions
 *   - tool_definitions (1 row)  — tool registry + memoryManifest entries
 *   - injected_memory  (N rows) — one row per BootstrapPayload.literalContext fragment
 *
 * @see docs/crucible-technical-design/02-l0-l1-boundary-contract.md §2.2
 * @see docs/crucible-technical-design/03-l1-wal-substrate.md §3.8
 */

import type { PrimitiveInput } from '../types.js';
import type { BootstrapMaterializer, BootstrapPayload } from './types.js';

class DefaultBootstrapMaterializer implements BootstrapMaterializer {
  materialize(payload: BootstrapPayload): PrimitiveInput[] {
    const rows: PrimitiveInput[] = [];

    // Row 1: system_prompt — the literal system-prompt text crossing L0/L1.
    rows.push({
      primitiveKind: 'observation',
      primitivePayload: {
        subKind: 'system_prompt',
        sessionId: payload.sessionId,
        sdkVersion: payload.sdkVersion,
        schemaVersion: payload.schemaVersion,
        content: payload.literalContext.systemPrompt,
      },
      causalReadSet: [],
    });

    // Row 2: tool_definitions — tool registry + memory manifest side-table.
    rows.push({
      primitiveKind: 'observation',
      primitivePayload: {
        subKind: 'tool_definitions',
        sessionId: payload.sessionId,
        tools: payload.literalContext.toolDefinitions,
        memoryManifest: payload.memoryManifest,
      },
      causalReadSet: [],
    });

    // Rows 3+: one injected_memory row per fragment (zero rows if no fragments).
    for (const fragment of payload.literalContext.injectedMemoryFragments) {
      rows.push({
        primitiveKind: 'observation',
        primitivePayload: {
          subKind: 'injected_memory',
          sessionId: payload.sessionId,
          sourceManifestId: fragment.sourceManifestId,
          content: fragment.content,
        },
        causalReadSet: [],
      });
    }

    return rows;
  }
}

/**
 * Create the default BootstrapMaterializer.
 *
 * Import by direct path (barrel is Graham's lane, not touched here):
 *   import { createBootstrapMaterializer } from '../skeleton/bootstrap.js';
 *
 * Valanice (T5 CLI): this factory is what you call to build the materializer
 * before handing it to the assembled SkeletonSession.
 */
export function createBootstrapMaterializer(): BootstrapMaterializer {
  return new DefaultBootstrapMaterializer();
}
