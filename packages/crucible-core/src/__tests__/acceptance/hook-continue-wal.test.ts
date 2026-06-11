import { describe, it, expect } from 'vitest';

import { createLedger } from '../../index.js';
import { InMemoryWalBackend } from '../../ledger/wal-backend-in-memory.js';

describe('Pre-Commit Hook COMMIT WAL encoding', () => {
  it('Acceptance: explicit COMMIT hook persists 0x00 while no-match persists 0xFF', async () => {
    const noMatchBackend = new InMemoryWalBackend();
    const noMatchLedger = await createLedger({ walBackend: noMatchBackend });
    await noMatchLedger.append({
      primitiveKind: 'request',
      primitivePayload: { content: 'no-match' },
      causalReadSet: [],
    });

    const explicitBackend = new InMemoryWalBackend();
    const explicitLedger = await createLedger({ walBackend: explicitBackend });
    await explicitLedger.registerHook(
      'allow-request',
      async () => ({ verdict: 'COMMIT' }),
      { budget: 50_000 },
    );
    await explicitLedger.append({
      primitiveKind: 'request',
      primitivePayload: { content: 'explicit-commit' },
      causalReadSet: [],
    });

    expect(noMatchBackend.readSegmentRecords()).toHaveLength(1);
    expect(explicitBackend.readSegmentRecords()).toHaveLength(1);
    expect(noMatchBackend.readSegmentRecords()[0].hookVerdict).toBe(0xFF);
    expect(explicitBackend.readSegmentRecords()[0].hookVerdict).toBe(0x00);
  });
});
