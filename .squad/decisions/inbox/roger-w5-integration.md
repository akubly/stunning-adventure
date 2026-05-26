# Roger W5 Integration Decision Drop

Date: 2026-05-26

## Integration branch

`phase-4.6/wave-5-integration`

## Merge order

1. W5-1 session-kind
2. W5-3 tier fallback
3. W5-4 staleness attenuation
4. W5-2 explicit DB hard-cut

Reason: land small independent deltas first, then stack W5-4 on its W5-3 base, then apply the cross-cutting DB refactor last so any newly introduced APIs are threaded once.

## Conflict summary

- W5-1: clean.
- W5-3: clean.
- W5-4: `.squad/identity/now.md`; kept `main`'s completed Wave 5 status because it was newer and already reflected all four isolated branches.
- W5-2: code conflicts in migration 012 tests, `packages/cairn/src/db/sessions.ts`, `packages/cairn/src/mcp/server.ts`, and `packages/skillsmith-runtime/src/index.ts`.

## Failure triage

- Forge “644/647”: not failures. These are 644 passing tests plus 3 pre-existing `it.todo` placeholders:
  - `prescribers-vectors.test.ts`: prompt-optimizer negative meanNetImpact confidence penalty todo.
  - `prescribers-vectors.test.ts`: token-optimizer negative meanNetImpact confidence penalty todo.
  - `weight-consistency.test.ts`: cross-package weight consistency todo.
- Runtime-CLI failure: `runForgePrescribe > forwards fallbackContext to use an intermediate per-model profile` seeded `upsertExecutionProfile()` without the explicit `db` parameter after W5-2. Root cause was a stale W5-3 test under W5-2's public API hard-cut. Fixed by passing `db`.

## Final validation

- `npm run build`: clean.
- `npm test`: green across workspaces.
- Final observed counts: Cairn 597/597, Forge 644 passed + 3 todo of 647, runtime-cli 9/9, skillsmith-runtime 24/24.

## PR strategy recommendation

Prefer one integration PR from `phase-4.6/wave-5-integration`. The isolated branches were green, but the value is in the resolved interaction between W5-1's new session APIs, W5-3/W5-4 runtime profile behavior, and W5-2's explicit DB hard-cut. If Aaron wants smaller review units, use four PRs in the same order and put the runtime-cli test fix on the W5-2 PR, but that will require carefully replaying the same conflict resolutions.
