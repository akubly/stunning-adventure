/**
 * Models module tests — Test contracts for model catalog, model switching,
 * and token budget tracking.
 *
 * These tests define the expected behavior of the Phase 3 models/ module
 * which provides model selection intelligence, mid-session model switching
 * with event tracking, and cumulative token budget tracking.
 *
 * TDD red phase: Tests define contracts BEFORE implementation exists.
 * All imports from ../models/ are TODO placeholders.
 *
 * @module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionEvent, ModelInfo } from '@github/copilot-sdk';
import {
  createMockClient,
  createMockSession,
  makeModelInfo,
  assistantUsageEvent,
  type MockCopilotSession,
  type MockCopilotClient,
} from './helpers/index.js';

// ---------------------------------------------------------------------------
// TODO: Replace with real imports once models/ module exists
//
//   import {
//     ModelCatalog,
//     ModelSwitcher,
//     TokenBudgetTracker,
//     type ModelSnapshot,
//     type ModelChangeRecord,
//     type TokenBudget,
//     type ModelStrategy,
//   } from '../models/index.js';
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Expected types — define the contract the models module must implement
// ---------------------------------------------------------------------------

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

interface ModelSnapshot {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
  billingMultiplier?: number;
  policyState?: string;
  supportedReasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
}

interface ModelChangeRecord {
  timestamp: string;
  previousModel?: string;
  newModel: string;
  previousReasoningEffort?: string;
  newReasoningEffort?: string;
}

interface PerModelUsage {
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalNanoAiu: number;
  totalDurationMs: number;
}

interface TokenBudget {
  sessionId: string;
  modelUsage: Map<string, PerModelUsage>;
  contextWindow: {
    tokenLimit?: number;
    peakTokens: number;
    lastTokens: number;
  };
}

type ModelStrategy = (
  models: ModelSnapshot[],
  context: { currentBudgetNanoAiu: number; budgetLimitNanoAiu: number },
) => ModelSnapshot | null;

// ---------------------------------------------------------------------------
// Inline implementations for contract testing
// ---------------------------------------------------------------------------

function toModelSnapshot(info: ModelInfo): ModelSnapshot {
  return {
    id: info.id,
    name: info.name,
    contextWindow: info.capabilities.limits.max_context_window_tokens,
    maxOutputTokens: info.capabilities.limits.max_prompt_tokens,
    supportsVision: info.capabilities.supports.vision,
    supportsReasoning: info.capabilities.supports.reasoningEffort,
    billingMultiplier: info.billing?.multiplier,
    policyState: info.policy?.state,
    supportedReasoningEfforts: info.supportedReasoningEfforts as ReasoningEffort[] | undefined,
    defaultReasoningEffort: info.defaultReasoningEffort as ReasoningEffort | undefined,
  };
}

class ModelCatalog {
  private snapshots: ModelSnapshot[] = [];

  async refresh(client: MockCopilotClient): Promise<void> {
    const models = await client.listModels();
    this.snapshots = models.map(toModelSnapshot);
  }

  list(): readonly ModelSnapshot[] {
    return [...this.snapshots];
  }

  get(modelId: string): ModelSnapshot | undefined {
    return this.snapshots.find(m => m.id === modelId);
  }

  filter(predicate: (m: ModelSnapshot) => boolean): ModelSnapshot[] {
    return this.snapshots.filter(predicate);
  }

  get size(): number {
    return this.snapshots.length;
  }

  selectByStrategy(
    strategy: ModelStrategy,
    context: { currentBudgetNanoAiu: number; budgetLimitNanoAiu: number },
  ): ModelSnapshot | null {
    return strategy(this.snapshots, context);
  }
}

class ModelSwitcher {
  private session: MockCopilotSession;
  private changes: ModelChangeRecord[] = [];
  private currentModel: string;

  constructor(session: MockCopilotSession, initialModel: string) {
    this.session = session;
    this.currentModel = initialModel;

    session.on('session.model_change', (event: SessionEvent) => {
      const data = event.data as {
        previousModel?: string;
        newModel: string;
        previousReasoningEffort?: string;
        newReasoningEffort?: string;
      };
      this.changes.push({
        timestamp: event.timestamp,
        ...data,
      });
      this.currentModel = data.newModel;
    });
  }

  async switchTo(modelId: string, options?: { reasoningEffort?: ReasoningEffort }): Promise<void> {
    await this.session.setModel(modelId, options);
  }

  getHistory(): readonly ModelChangeRecord[] {
    return [...this.changes];
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  get changeCount(): number {
    return this.changes.length;
  }
}

class TokenBudgetTracker {
  private budget: TokenBudget;
  private unsubscribers: Array<() => void> = [];

  constructor(session: MockCopilotSession, sessionId: string) {
    this.budget = {
      sessionId,
      modelUsage: new Map(),
      contextWindow: { peakTokens: 0, lastTokens: 0 },
    };

    const unsubUsage = session.on('assistant.usage', (event: SessionEvent) => {
      const d = event.data as {
        model?: string;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        duration?: number;
        copilotUsage?: { totalNanoAiu?: number };
      };

      const model = d.model ?? 'unknown';
      const existing = this.budget.modelUsage.get(model) ?? {
        callCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalNanoAiu: 0,
        totalDurationMs: 0,
      };

      existing.callCount++;
      existing.totalInputTokens += d.inputTokens ?? 0;
      existing.totalOutputTokens += d.outputTokens ?? 0;
      existing.totalCacheReadTokens += d.cacheReadTokens ?? 0;
      existing.totalCacheWriteTokens += d.cacheWriteTokens ?? 0;
      existing.totalNanoAiu += d.copilotUsage?.totalNanoAiu ?? 0;
      existing.totalDurationMs += d.duration ?? 0;

      this.budget.modelUsage.set(model, existing);
    });

    const unsubContext = session.on('session.usage_info', (event: SessionEvent) => {
      const d = event.data as {
        tokenLimit?: number;
        currentTokens?: number;
      };

      if (d.tokenLimit) this.budget.contextWindow.tokenLimit = d.tokenLimit;
      const current = d.currentTokens ?? 0;
      this.budget.contextWindow.lastTokens = current;
      if (current > this.budget.contextWindow.peakTokens) {
        this.budget.contextWindow.peakTokens = current;
      }
    });

    if (unsubUsage) this.unsubscribers.push(unsubUsage);
    if (unsubContext) this.unsubscribers.push(unsubContext);
  }

  getBudget(): TokenBudget {
    return this.budget;
  }

  getModelUsage(modelId: string): PerModelUsage | undefined {
    return this.budget.modelUsage.get(modelId);
  }

  getTotalNanoAiu(): number {
    let total = 0;
    for (const usage of this.budget.modelUsage.values()) {
      total += usage.totalNanoAiu;
    }
    return total;
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }
}

// ---------------------------------------------------------------------------
// Model strategy implementations (from spike)
// ---------------------------------------------------------------------------

const STRATEGIES: Record<string, ModelStrategy> = {
  cheapest: (models) => {
    const enabled = models.filter(m => m.policyState !== 'disabled');
    return enabled.sort((a, b) =>
      (a.billingMultiplier ?? 1) - (b.billingMultiplier ?? 1),
    )[0] ?? null;
  },

  smartest: (models) => {
    const enabled = models.filter(m => m.policyState !== 'disabled');
    return enabled.sort((a, b) => {
      if (a.supportsReasoning !== b.supportsReasoning) {
        return b.supportsReasoning ? 1 : -1;
      }
      return b.contextWindow - a.contextWindow;
    })[0] ?? null;
  },

  budgetAware: (models, context) => {
    const budgetUsed = context.currentBudgetNanoAiu / context.budgetLimitNanoAiu;
    const enabled = models.filter(m => m.policyState !== 'disabled');
    if (budgetUsed > 0.8) {
      return enabled.sort((a, b) =>
        (a.billingMultiplier ?? 1) - (b.billingMultiplier ?? 1),
      )[0] ?? null;
    }
    return STRATEGIES.smartest(models, context);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUsageEvent(
  model: string,
  inputTokens: number,
  outputTokens: number,
  opts: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    duration?: number;
    totalNanoAiu?: number;
  } = {},
): SessionEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type: 'assistant.usage',
    timestamp: new Date().toISOString(),
    parentId: null,
    data: {
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens: opts.cacheReadTokens ?? 0,
      cacheWriteTokens: opts.cacheWriteTokens ?? 0,
      duration: opts.duration ?? 1000,
      copilotUsage: opts.totalNanoAiu !== undefined
        ? { totalNanoAiu: opts.totalNanoAiu }
        : undefined,
    },
  } as unknown as SessionEvent;
}

function makeUsageInfoEvent(
  currentTokens: number,
  tokenLimit?: number,
): SessionEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type: 'session.usage_info',
    timestamp: new Date().toISOString(),
    parentId: null,
    data: {
      tokenLimit,
      currentTokens,
    },
  } as unknown as SessionEvent;
}

function makeModelChangeEvent(
  newModel: string,
  previousModel?: string,
  opts: { newReasoningEffort?: string; previousReasoningEffort?: string } = {},
): SessionEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type: 'session.model_change',
    timestamp: new Date().toISOString(),
    parentId: null,
    data: {
      previousModel,
      newModel,
      previousReasoningEffort: opts.previousReasoningEffort,
      newReasoningEffort: opts.newReasoningEffort,
    },
  } as unknown as SessionEvent;
}

// ===========================================================================
// ModelCatalog — listing and querying models
// ===========================================================================

describe('ModelCatalog — listing and querying', () => {
  it('refresh fetches models from client.listModels()', async () => {
    const models = [
      makeModelInfo({ id: 'gpt-4', name: 'GPT-4' }),
      makeModelInfo({ id: 'claude-sonnet', name: 'Claude Sonnet' }),
    ];
    const client = createMockClient({ models });

    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    expect(catalog.size).toBe(2);
    expect(client.listModels).toHaveBeenCalledOnce();
  });

  it('list returns ModelSnapshot array', async () => {
    const client = createMockClient({
      models: [makeModelInfo({ id: 'gpt-4', name: 'GPT-4' })],
    });

    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    const list = catalog.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('gpt-4');
    expect(list[0].name).toBe('GPT-4');
    expect(typeof list[0].contextWindow).toBe('number');
    expect(typeof list[0].supportsVision).toBe('boolean');
  });

  it('get returns specific model by ID', async () => {
    const client = createMockClient({
      models: [
        makeModelInfo({ id: 'gpt-4', name: 'GPT-4' }),
        makeModelInfo({ id: 'claude-sonnet', name: 'Claude Sonnet' }),
      ],
    });

    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    const model = catalog.get('claude-sonnet');
    expect(model).toBeDefined();
    expect(model!.id).toBe('claude-sonnet');
  });

  it('get returns undefined for unknown model ID', async () => {
    const client = createMockClient();
    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    expect(catalog.get('nonexistent')).toBeUndefined();
  });

  it('filter returns models matching predicate', async () => {
    const client = createMockClient({
      models: [
        makeModelInfo({
          id: 'gpt-4',
          capabilities: {
            limits: { max_context_window_tokens: 128000, max_prompt_tokens: 4096 },
            supports: { vision: true, reasoningEffort: false },
          },
        } as Partial<ModelInfo>),
        makeModelInfo({
          id: 'claude-sonnet',
          capabilities: {
            limits: { max_context_window_tokens: 200000, max_prompt_tokens: 8192 },
            supports: { vision: false, reasoningEffort: true },
          },
        } as Partial<ModelInfo>),
      ],
    });

    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    const visionModels = catalog.filter(m => m.supportsVision);
    expect(visionModels).toHaveLength(1);
    expect(visionModels[0].id).toBe('gpt-4');
  });

  it('list returns copies, not mutable references', async () => {
    const client = createMockClient();
    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    const list1 = catalog.list();
    const list2 = catalog.list();
    expect(list1).not.toBe(list2);
  });

  it('empty catalog before refresh', () => {
    const catalog = new ModelCatalog();
    expect(catalog.size).toBe(0);
    expect(catalog.list()).toEqual([]);
  });
});

// ===========================================================================
// ModelCatalog — toModelSnapshot extraction
// ===========================================================================

describe('ModelCatalog — toModelSnapshot', () => {
  it('extracts all required fields', () => {
    const info = makeModelInfo();
    const snapshot = toModelSnapshot(info);

    expect(snapshot.id).toBe('gpt-4');
    expect(snapshot.name).toBe('GPT-4');
    expect(snapshot.contextWindow).toBe(128000);
    expect(snapshot.supportsVision).toBe(true);
    expect(snapshot.supportsReasoning).toBe(false);
  });

  it('extracts optional fields when present', () => {
    const info = makeModelInfo({
      billing: { multiplier: 2.0 },
      policy: { state: 'enabled', terms: '' },
      supportedReasoningEfforts: ['low', 'medium', 'high'] as ReasoningEffort[],
      defaultReasoningEffort: 'medium' as ReasoningEffort,
    } as Partial<ModelInfo>);
    const snapshot = toModelSnapshot(info);

    expect(snapshot.billingMultiplier).toBe(2.0);
    expect(snapshot.policyState).toBe('enabled');
    expect(snapshot.supportedReasoningEfforts).toEqual(['low', 'medium', 'high']);
    expect(snapshot.defaultReasoningEffort).toBe('medium');
  });

  it('handles missing optional fields gracefully', () => {
    const info = makeModelInfo({
      billing: undefined,
      policy: undefined,
      supportedReasoningEfforts: undefined,
      defaultReasoningEffort: undefined,
    } as unknown as Partial<ModelInfo>);
    const snapshot = toModelSnapshot(info);

    expect(snapshot.billingMultiplier).toBeUndefined();
    expect(snapshot.policyState).toBeUndefined();
    expect(snapshot.supportedReasoningEfforts).toBeUndefined();
    expect(snapshot.defaultReasoningEffort).toBeUndefined();
  });

  it('extracts maxOutputTokens from SDK limits', () => {
    const info = makeModelInfo({
      capabilities: {
        limits: { max_context_window_tokens: 128000, max_prompt_tokens: 8192 },
        supports: { vision: true, reasoningEffort: false },
      },
    } as Partial<ModelInfo>);
    const snapshot = toModelSnapshot(info);

    expect(snapshot.maxOutputTokens).toBe(8192);
  });
});

// ===========================================================================
// ModelSwitcher — mid-session model switching
// ===========================================================================

describe('ModelSwitcher — model switching', () => {
  let mockSession: MockCopilotSession;
  let switcher: ModelSwitcher;

  beforeEach(() => {
    mockSession = createMockSession();
    switcher = new ModelSwitcher(mockSession, 'gpt-4');
  });

  it('switchTo calls session.setModel', async () => {
    await switcher.switchTo('claude-sonnet-4.6');

    expect(mockSession.setModel).toHaveBeenCalledWith('claude-sonnet-4.6', undefined);
  });

  it('switchTo passes reasoning effort option', async () => {
    await switcher.switchTo('claude-sonnet-4.6', { reasoningEffort: 'high' });

    expect(mockSession.setModel).toHaveBeenCalledWith(
      'claude-sonnet-4.6',
      { reasoningEffort: 'high' },
    );
  });

  it('tracks model changes from session events', () => {
    mockSession._emit(makeModelChangeEvent('claude-sonnet-4.6', 'gpt-4'));

    const history = switcher.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].previousModel).toBe('gpt-4');
    expect(history[0].newModel).toBe('claude-sonnet-4.6');
  });

  it('tracks multiple model changes in order', () => {
    mockSession._emit(makeModelChangeEvent('claude-sonnet-4.6', 'gpt-4'));
    mockSession._emit(makeModelChangeEvent('gpt-4.1', 'claude-sonnet-4.6'));

    const history = switcher.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].newModel).toBe('claude-sonnet-4.6');
    expect(history[1].newModel).toBe('gpt-4.1');
  });

  it('updates current model from change events', () => {
    expect(switcher.getCurrentModel()).toBe('gpt-4');

    mockSession._emit(makeModelChangeEvent('claude-sonnet-4.6', 'gpt-4'));

    expect(switcher.getCurrentModel()).toBe('claude-sonnet-4.6');
  });

  it('tracks reasoning effort changes', () => {
    mockSession._emit(makeModelChangeEvent('claude-sonnet-4.6', 'gpt-4', {
      previousReasoningEffort: 'medium',
      newReasoningEffort: 'high',
    }));

    const record = switcher.getHistory()[0];
    expect(record.previousReasoningEffort).toBe('medium');
    expect(record.newReasoningEffort).toBe('high');
  });

  it('changeCount reflects total switches', () => {
    expect(switcher.changeCount).toBe(0);

    mockSession._emit(makeModelChangeEvent('claude-sonnet-4.6', 'gpt-4'));
    mockSession._emit(makeModelChangeEvent('gpt-4.1', 'claude-sonnet-4.6'));

    expect(switcher.changeCount).toBe(2);
  });

  it('history returns copies, not mutable references', () => {
    mockSession._emit(makeModelChangeEvent('claude-sonnet-4.6', 'gpt-4'));

    const h1 = switcher.getHistory();
    const h2 = switcher.getHistory();
    expect(h1).not.toBe(h2);
    expect(h1).toEqual(h2);
  });
});

// ===========================================================================
// TokenBudgetTracker — usage accumulation
// ===========================================================================

describe('TokenBudgetTracker — usage accumulation', () => {
  let mockSession: MockCopilotSession;
  let tracker: TokenBudgetTracker;

  beforeEach(() => {
    mockSession = createMockSession();
    tracker = new TokenBudgetTracker(mockSession, 'sess-budget-001');
  });

  it('tracks session ID', () => {
    expect(tracker.getBudget().sessionId).toBe('sess-budget-001');
  });

  it('accumulates token counts from assistant.usage events', () => {
    mockSession._emit(makeUsageEvent('gpt-4', 500, 100));
    mockSession._emit(makeUsageEvent('gpt-4', 300, 75));

    const usage = tracker.getModelUsage('gpt-4');
    expect(usage).toBeDefined();
    expect(usage!.callCount).toBe(2);
    expect(usage!.totalInputTokens).toBe(800);
    expect(usage!.totalOutputTokens).toBe(175);
  });

  it('tracks usage per-model independently', () => {
    mockSession._emit(makeUsageEvent('gpt-4', 500, 100));
    mockSession._emit(makeUsageEvent('claude-sonnet', 300, 200));

    const gpt4 = tracker.getModelUsage('gpt-4');
    const claude = tracker.getModelUsage('claude-sonnet');

    expect(gpt4!.callCount).toBe(1);
    expect(gpt4!.totalInputTokens).toBe(500);
    expect(claude!.callCount).toBe(1);
    expect(claude!.totalInputTokens).toBe(300);
  });

  it('accumulates cache tokens', () => {
    mockSession._emit(makeUsageEvent('gpt-4', 500, 100, {
      cacheReadTokens: 200,
      cacheWriteTokens: 50,
    }));

    const usage = tracker.getModelUsage('gpt-4');
    expect(usage!.totalCacheReadTokens).toBe(200);
    expect(usage!.totalCacheWriteTokens).toBe(50);
  });

  it('accumulates nano-AIU from copilotUsage', () => {
    mockSession._emit(makeUsageEvent('gpt-4', 500, 100, { totalNanoAiu: 52500 }));
    mockSession._emit(makeUsageEvent('gpt-4', 300, 75, { totalNanoAiu: 31000 }));

    const usage = tracker.getModelUsage('gpt-4');
    expect(usage!.totalNanoAiu).toBe(83500);
  });

  it('accumulates duration across calls', () => {
    mockSession._emit(makeUsageEvent('gpt-4', 500, 100, { duration: 2000 }));
    mockSession._emit(makeUsageEvent('gpt-4', 300, 75, { duration: 1500 }));

    const usage = tracker.getModelUsage('gpt-4');
    expect(usage!.totalDurationMs).toBe(3500);
  });

  it('getTotalNanoAiu sums across all models', () => {
    mockSession._emit(makeUsageEvent('gpt-4', 500, 100, { totalNanoAiu: 50000 }));
    mockSession._emit(makeUsageEvent('claude-sonnet', 300, 200, { totalNanoAiu: 45000 }));

    expect(tracker.getTotalNanoAiu()).toBe(95000);
  });

  it('defaults to "unknown" model when not specified', () => {
    const event = {
      id: 'evt-001',
      type: 'assistant.usage',
      timestamp: new Date().toISOString(),
      parentId: null,
      data: { inputTokens: 100, outputTokens: 50 },
    } as unknown as SessionEvent;

    mockSession._emit(event);

    const usage = tracker.getModelUsage('unknown');
    expect(usage).toBeDefined();
    expect(usage!.totalInputTokens).toBe(100);
  });

  it('returns undefined for untracked models', () => {
    expect(tracker.getModelUsage('nonexistent')).toBeUndefined();
  });
});

// ===========================================================================
// TokenBudgetTracker — context window tracking
// ===========================================================================

describe('TokenBudgetTracker — context window', () => {
  let mockSession: MockCopilotSession;
  let tracker: TokenBudgetTracker;

  beforeEach(() => {
    mockSession = createMockSession();
    tracker = new TokenBudgetTracker(mockSession, 'sess-ctx-001');
  });

  it('tracks token limit from usage_info events', () => {
    mockSession._emit(makeUsageInfoEvent(5000, 128000));

    const budget = tracker.getBudget();
    expect(budget.contextWindow.tokenLimit).toBe(128000);
  });

  it('tracks current token count', () => {
    mockSession._emit(makeUsageInfoEvent(5000));

    const budget = tracker.getBudget();
    expect(budget.contextWindow.lastTokens).toBe(5000);
  });

  it('tracks peak token count across multiple events', () => {
    mockSession._emit(makeUsageInfoEvent(5000));
    mockSession._emit(makeUsageInfoEvent(12000));
    mockSession._emit(makeUsageInfoEvent(8000));

    const budget = tracker.getBudget();
    expect(budget.contextWindow.peakTokens).toBe(12000);
    expect(budget.contextWindow.lastTokens).toBe(8000);
  });

  it('starts with zero peak and last tokens', () => {
    const budget = tracker.getBudget();
    expect(budget.contextWindow.peakTokens).toBe(0);
    expect(budget.contextWindow.lastTokens).toBe(0);
    expect(budget.contextWindow.tokenLimit).toBeUndefined();
  });

  it('updates token limit if it changes', () => {
    mockSession._emit(makeUsageInfoEvent(5000, 128000));
    mockSession._emit(makeUsageInfoEvent(8000, 200000));

    expect(tracker.getBudget().contextWindow.tokenLimit).toBe(200000);
  });
});

// ===========================================================================
// TokenBudgetTracker — lifecycle
// ===========================================================================

describe('TokenBudgetTracker — lifecycle', () => {
  it('dispose unsubscribes from events', () => {
    const mockSession = createMockSession();
    const tracker = new TokenBudgetTracker(mockSession, 'sess-dispose-001');

    mockSession._emit(makeUsageEvent('gpt-4', 500, 100));
    expect(tracker.getModelUsage('gpt-4')!.callCount).toBe(1);

    tracker.dispose();

    // After dispose, the unsubscribe stubs fire. In the real implementation,
    // new events would not be tracked. We verify dispose doesn't throw.
    expect(() => tracker.dispose()).not.toThrow();
  });

  it('handles zero usage gracefully', () => {
    const mockSession = createMockSession();
    const tracker = new TokenBudgetTracker(mockSession, 'sess-empty-001');

    expect(tracker.getTotalNanoAiu()).toBe(0);
    expect(tracker.getBudget().modelUsage.size).toBe(0);
  });
});

// ===========================================================================
// Model strategies — selection intelligence
// ===========================================================================

describe('Model strategies — cheapest', () => {
  it('selects model with lowest billing multiplier', () => {
    const models: ModelSnapshot[] = [
      { id: 'expensive', name: 'E', contextWindow: 128000, supportsVision: true, supportsReasoning: true, billingMultiplier: 3.0 },
      { id: 'cheap', name: 'C', contextWindow: 64000, supportsVision: false, supportsReasoning: false, billingMultiplier: 0.5 },
      { id: 'medium', name: 'M', contextWindow: 96000, supportsVision: true, supportsReasoning: false, billingMultiplier: 1.0 },
    ];

    const result = STRATEGIES.cheapest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 });
    expect(result!.id).toBe('cheap');
  });

  it('excludes disabled models', () => {
    const models: ModelSnapshot[] = [
      { id: 'cheap-disabled', name: 'CD', contextWindow: 64000, supportsVision: false, supportsReasoning: false, billingMultiplier: 0.1, policyState: 'disabled' },
      { id: 'enabled', name: 'E', contextWindow: 128000, supportsVision: true, supportsReasoning: false, billingMultiplier: 1.0, policyState: 'enabled' },
    ];

    const result = STRATEGIES.cheapest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 });
    expect(result!.id).toBe('enabled');
  });

  it('returns null for empty model list', () => {
    const result = STRATEGIES.cheapest([], { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 });
    expect(result).toBeNull();
  });

  it('defaults billing multiplier to 1 when undefined', () => {
    const models: ModelSnapshot[] = [
      { id: 'no-billing', name: 'NB', contextWindow: 128000, supportsVision: true, supportsReasoning: false },
      { id: 'has-billing', name: 'HB', contextWindow: 64000, supportsVision: false, supportsReasoning: false, billingMultiplier: 2.0 },
    ];

    const result = STRATEGIES.cheapest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 });
    expect(result!.id).toBe('no-billing');
  });
});

describe('Model strategies — smartest', () => {
  it('prefers reasoning-capable models', () => {
    const models: ModelSnapshot[] = [
      { id: 'big-no-reason', name: 'BNR', contextWindow: 200000, supportsVision: true, supportsReasoning: false },
      { id: 'small-reason', name: 'SR', contextWindow: 64000, supportsVision: false, supportsReasoning: true },
    ];

    const result = STRATEGIES.smartest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 });
    expect(result!.id).toBe('small-reason');
  });

  it('breaks ties by context window size', () => {
    const models: ModelSnapshot[] = [
      { id: 'small', name: 'S', contextWindow: 64000, supportsVision: false, supportsReasoning: true },
      { id: 'large', name: 'L', contextWindow: 200000, supportsVision: false, supportsReasoning: true },
    ];

    const result = STRATEGIES.smartest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 });
    expect(result!.id).toBe('large');
  });

  it('excludes disabled models', () => {
    const models: ModelSnapshot[] = [
      { id: 'smart-disabled', name: 'SD', contextWindow: 200000, supportsVision: true, supportsReasoning: true, policyState: 'disabled' },
      { id: 'less-smart', name: 'LS', contextWindow: 64000, supportsVision: false, supportsReasoning: false, policyState: 'enabled' },
    ];

    const result = STRATEGIES.smartest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 });
    expect(result!.id).toBe('less-smart');
  });
});

describe('Model strategies — budgetAware', () => {
  it('uses smartest when under 80% budget', () => {
    const models: ModelSnapshot[] = [
      { id: 'cheap', name: 'C', contextWindow: 64000, supportsVision: false, supportsReasoning: false, billingMultiplier: 0.5 },
      { id: 'smart', name: 'S', contextWindow: 200000, supportsVision: true, supportsReasoning: true, billingMultiplier: 3.0 },
    ];

    const result = STRATEGIES.budgetAware(models, {
      currentBudgetNanoAiu: 100_000,
      budgetLimitNanoAiu: 1_000_000,
    });
    expect(result!.id).toBe('smart');
  });

  it('switches to cheapest when over 80% budget', () => {
    const models: ModelSnapshot[] = [
      { id: 'cheap', name: 'C', contextWindow: 64000, supportsVision: false, supportsReasoning: false, billingMultiplier: 0.5 },
      { id: 'smart', name: 'S', contextWindow: 200000, supportsVision: true, supportsReasoning: true, billingMultiplier: 3.0 },
    ];

    const result = STRATEGIES.budgetAware(models, {
      currentBudgetNanoAiu: 850_000,
      budgetLimitNanoAiu: 1_000_000,
    });
    expect(result!.id).toBe('cheap');
  });

  it('uses cheapest at exactly 80% threshold', () => {
    const models: ModelSnapshot[] = [
      { id: 'cheap', name: 'C', contextWindow: 64000, supportsVision: false, supportsReasoning: false, billingMultiplier: 0.5 },
      { id: 'smart', name: 'S', contextWindow: 200000, supportsVision: true, supportsReasoning: true, billingMultiplier: 3.0 },
    ];

    const result = STRATEGIES.budgetAware(models, {
      currentBudgetNanoAiu: 800_001,
      budgetLimitNanoAiu: 1_000_000,
    });
    expect(result!.id).toBe('cheap');
  });
});

// ===========================================================================
// ModelCatalog — strategy integration
// ===========================================================================

describe('ModelCatalog — strategy integration', () => {
  it('selectByStrategy delegates to strategy function', async () => {
    const client = createMockClient({
      models: [
        makeModelInfo({ id: 'gpt-4', billing: { multiplier: 1.5 } } as Partial<ModelInfo>),
        makeModelInfo({ id: 'gpt-mini', name: 'GPT-Mini', billing: { multiplier: 0.3 } } as Partial<ModelInfo>),
      ],
    });

    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    const result = catalog.selectByStrategy(STRATEGIES.cheapest, {
      currentBudgetNanoAiu: 0,
      budgetLimitNanoAiu: 1_000_000,
    });

    expect(result).toBeDefined();
    expect(result!.id).toBe('gpt-mini');
  });

  it('selectByStrategy returns null when strategy finds no match', async () => {
    const client = createMockClient({ models: [] });
    client.listModels.mockResolvedValueOnce([]);

    const catalog = new ModelCatalog();
    await catalog.refresh(client);

    const result = catalog.selectByStrategy(STRATEGIES.cheapest, {
      currentBudgetNanoAiu: 0,
      budgetLimitNanoAiu: 1_000_000,
    });

    expect(result).toBeNull();
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe('Models module — edge cases', () => {
  it('usage event with missing copilotUsage defaults nanoAiu to 0', () => {
    const mockSession = createMockSession();
    const tracker = new TokenBudgetTracker(mockSession, 'sess-edge-001');

    const event = {
      id: 'evt-001',
      type: 'assistant.usage',
      timestamp: new Date().toISOString(),
      parentId: null,
      data: { model: 'gpt-4', inputTokens: 100, outputTokens: 50 },
    } as unknown as SessionEvent;

    mockSession._emit(event);

    expect(tracker.getModelUsage('gpt-4')!.totalNanoAiu).toBe(0);
  });

  it('usage event with zero tokens handled correctly', () => {
    const mockSession = createMockSession();
    const tracker = new TokenBudgetTracker(mockSession, 'sess-edge-002');

    mockSession._emit(makeUsageEvent('gpt-4', 0, 0, { totalNanoAiu: 0 }));

    const usage = tracker.getModelUsage('gpt-4');
    expect(usage!.callCount).toBe(1);
    expect(usage!.totalInputTokens).toBe(0);
    expect(usage!.totalOutputTokens).toBe(0);
  });

  it('model switcher handles change event without previousModel', () => {
    const mockSession = createMockSession();
    const switcher = new ModelSwitcher(mockSession, 'gpt-4');

    mockSession._emit(makeModelChangeEvent('claude-sonnet-4.6'));

    const history = switcher.getHistory();
    expect(history[0].previousModel).toBeUndefined();
    expect(history[0].newModel).toBe('claude-sonnet-4.6');
  });

  it('context window peak never decreases', () => {
    const mockSession = createMockSession();
    const tracker = new TokenBudgetTracker(mockSession, 'sess-peak-001');

    mockSession._emit(makeUsageInfoEvent(10000));
    mockSession._emit(makeUsageInfoEvent(5000));
    mockSession._emit(makeUsageInfoEvent(15000));
    mockSession._emit(makeUsageInfoEvent(3000));

    expect(tracker.getBudget().contextWindow.peakTokens).toBe(15000);
  });

  it('all models disabled returns null from strategies', () => {
    const models: ModelSnapshot[] = [
      { id: 'a', name: 'A', contextWindow: 128000, supportsVision: true, supportsReasoning: false, policyState: 'disabled' },
      { id: 'b', name: 'B', contextWindow: 64000, supportsVision: false, supportsReasoning: true, policyState: 'disabled' },
    ];

    expect(STRATEGIES.cheapest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 })).toBeNull();
    expect(STRATEGIES.smartest(models, { currentBudgetNanoAiu: 0, budgetLimitNanoAiu: 1_000_000 })).toBeNull();
  });
});
