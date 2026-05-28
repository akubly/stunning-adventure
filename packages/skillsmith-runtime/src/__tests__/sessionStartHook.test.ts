import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunSessionStartHook = vi.fn();
const mockCreatePrescriberOrchestrationConfig = vi.fn();

vi.mock('@akubly/cairn', () => ({
  runSessionStartHook: mockRunSessionStartHook,
}));

vi.mock('../index.js', () => ({
  createPrescriberOrchestrationConfig: mockCreatePrescriberOrchestrationConfig,
}));

async function loadHookModule(): Promise<void> {
  vi.resetModules();
  await import('../hooks/sessionStart.js');
  await Promise.resolve();
}

describe('skillsmith-runtime session-start bootstrap', () => {
  beforeEach(() => {
    mockRunSessionStartHook.mockReset();
    mockCreatePrescriberOrchestrationConfig.mockReset();
    mockCreatePrescriberOrchestrationConfig.mockReturnValue({ runForSkill: vi.fn() });
    vi.spyOn(process, 'exit').mockImplementation(((_code?: string | number | null) => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs an auto-run summary to stderr when prescribers did work', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRunSessionStartHook.mockImplementation(async (_factory, afterCurate) => {
      afterCurate?.({
        eventsProcessed: 0,
        insightsCreated: 0,
        insightsReinforced: 0,
        capped: false,
        insightsChanged: false,
        changeVectorSweep: {
          computed: 0,
          skippedInsufficientSessions: 0,
          alreadyComputed: 0,
          sessionCountReset: 0,
          computedSkillIds: [],
        },
        prescribers: [
          {
            skillId: 'skill-auto-a',
            hintsGenerated: 1,
            hintsInserted: 1,
            hintsDuplicated: 0,
            hintsError: 0,
          },
          {
            skillId: 'skill-auto-b',
            hintsGenerated: 0,
            hintsInserted: 0,
            hintsDuplicated: 1,
            hintsError: 0,
            skippedReason: 'time-budget-exceeded',
          },
        ],
      });
    });

    await loadHookModule();

    expect(mockRunSessionStartHook).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'skillsmith-runtime: prescribers (auto) processed=2 inserted=1 duplicated=1 errors=0 skipped=1',
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('logs bootstrap failures before exiting successfully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRunSessionStartHook.mockRejectedValue(new Error('boom'));

    await loadHookModule();

    expect(warnSpy).toHaveBeenCalledWith('skillsmith-runtime bootstrap: hook execution failed: boom');
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
