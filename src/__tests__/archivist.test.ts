import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createSession, getActiveSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { getSkips } from '../db/skipBreadcrumbs.js';
import { getLastProcessedEventId, advanceCursor } from '../db/curatorState.js';
import {
  startSession,
  stopSession,
  recordToolUse,
  recordError,
  recordSkipEvent,
  catchUpPreviousSession,
} from '../agents/archivist.js';
import { scrubSecrets } from '../agents/secretScrubber.js';
import {
  getSessionSummary,
  hasEventOccurred,
  findEvents,
} from '../agents/sessionState.js';

beforeEach(() => {
  closeDb();
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Archivist lifecycle
// ---------------------------------------------------------------------------

describe('archivist lifecycle', () => {
  beforeEach(() => {
    getDb(':memory:');
  });

  it('should create a new session and log session_start event', () => {
    const sessionId = startSession('org_repo', 'main');
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');

    const session = getActiveSession('org_repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(sessionId);

    // Check that a session_start event was logged
    const db = getDb();
    const events = db
      .prepare("SELECT * FROM event_log WHERE session_id = ? AND event_type = 'session_start'")
      .all(sessionId) as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
  });

  it('should resume an existing active session instead of creating a duplicate', () => {
    const firstId = startSession('org_repo', 'main');
    const secondId = startSession('org_repo', 'main');
    expect(secondId).toBe(firstId);

    // Check that a session_resume event was logged
    const db = getDb();
    const events = db
      .prepare("SELECT * FROM event_log WHERE session_id = ? AND event_type = 'session_resume'")
      .all(firstId) as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
  });

  it('should slugify repo URLs when starting a session', () => {
    const sessionId = startSession('https://github.com/org/repo.git', 'main');
    expect(sessionId).toBeDefined();

    const session = getActiveSession('org_repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(sessionId);
  });

  it('should end session and log session_end event', () => {
    const sessionId = startSession('org_repo', 'main');
    stopSession(sessionId);

    expect(getActiveSession('org_repo')).toBeUndefined();

    const db = getDb();
    const events = db
      .prepare("SELECT * FROM event_log WHERE session_id = ? AND event_type = 'session_end'")
      .all(sessionId) as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
  });

  it('should detect crashed sessions and recover them', () => {
    // Create a session but don't end it (simulates crash)
    createSession('org_repo', 'main');

    const result = catchUpPreviousSession('org_repo');
    expect(result.recovered).toBe(true);
    expect(result.sessionId).toBeDefined();

    // Session should now be ended
    expect(getActiveSession('org_repo')).toBeUndefined();

    // Should have logged crash detection event
    const db = getDb();
    const events = db
      .prepare(
        "SELECT * FROM event_log WHERE session_id = ? AND event_type = 'session_crash_detected'",
      )
      .all(result.sessionId!) as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
  });

  it('should return recovered: false when no orphan session exists', () => {
    const result = catchUpPreviousSession('org_repo');
    expect(result.recovered).toBe(false);
    expect(result.sessionId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tool use recording
// ---------------------------------------------------------------------------

describe('tool use recording', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should log a tool_use event with tool name and args', () => {
    const eventId = recordToolUse(sessionId, 'grep', { pattern: 'TODO' });
    expect(eventId).toBeGreaterThan(0);

    const db = getDb();
    const event = db
      .prepare('SELECT * FROM event_log WHERE id = ?')
      .get(eventId) as Record<string, unknown>;
    expect(event.event_type).toBe('tool_use');

    const payload = JSON.parse(event.payload as string);
    expect(payload.tool).toBe('grep');
    expect(payload.args.pattern).toBe('TODO');
  });

  it('should scrub secrets from payload before logging', () => {
    const eventId = recordToolUse(
      sessionId,
      'curl',
      { url: 'https://api.example.com', headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.test.signature' } },
    );

    const db = getDb();
    const event = db
      .prepare('SELECT * FROM event_log WHERE id = ?')
      .get(eventId) as Record<string, unknown>;
    const payload = JSON.parse(event.payload as string);
    expect(payload.args.headers.Authorization).toContain('[REDACTED');
    expect(payload.args.headers.Authorization).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });
});

// ---------------------------------------------------------------------------
// Error recording
// ---------------------------------------------------------------------------

describe('error recording', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should log an error event with category and message', () => {
    const eventId = recordError(sessionId, 'build', 'TypeScript compilation failed');
    expect(eventId).toBeGreaterThan(0);

    const db = getDb();
    const event = db
      .prepare('SELECT * FROM event_log WHERE id = ?')
      .get(eventId) as Record<string, unknown>;
    expect(event.event_type).toBe('error');

    const payload = JSON.parse(event.payload as string);
    expect(payload.category).toBe('build');
    expect(payload.message).toBe('TypeScript compilation failed');
  });

  it('should scrub secrets from error context', () => {
    const eventId = recordError(sessionId, 'auth', 'Login failed', {
      token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz1234',
    });

    const db = getDb();
    const event = db
      .prepare('SELECT * FROM event_log WHERE id = ?')
      .get(eventId) as Record<string, unknown>;
    const payload = JSON.parse(event.payload as string);
    expect(payload.context.token).toBe('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Skip recording
// ---------------------------------------------------------------------------

describe('skip recording', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should log a skip event AND create a skip breadcrumb', () => {
    const eventId = recordSkipEvent(sessionId, 'review', 'time pressure', 'code-reviewer');
    expect(eventId).toBeGreaterThan(0);

    // Check event_log
    const db = getDb();
    const event = db
      .prepare('SELECT * FROM event_log WHERE id = ?')
      .get(eventId) as Record<string, unknown>;
    expect(event.event_type).toBe('skip');

    // Check skip_breadcrumbs
    const skips = getSkips(sessionId);
    expect(skips).toHaveLength(1);
    expect(skips[0].whatSkipped).toBe('review');
    expect(skips[0].reason).toBe('time pressure');
    expect(skips[0].agent).toBe('code-reviewer');
  });

  it('should work without optional fields', () => {
    const eventId = recordSkipEvent(sessionId, 'lint');
    expect(eventId).toBeGreaterThan(0);

    const skips = getSkips(sessionId);
    expect(skips).toHaveLength(1);
    expect(skips[0].whatSkipped).toBe('lint');
    expect(skips[0].reason).toBeUndefined();
    expect(skips[0].agent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Secret scrubber
// ---------------------------------------------------------------------------

describe('secret scrubber', () => {
  it('should scrub GitHub tokens (ghp_)', () => {
    const input = 'token is ghp_abcdefghijklmnopqrstuvwxyz1234567890AB';
    const result = scrubSecrets(input);
    expect(result).toContain('[REDACTED:GitHub token]');
    expect(result).not.toContain('ghp_');
  });

  it('should scrub GitHub tokens (ghs_)', () => {
    const input = 'token is ghs_abcdefghijklmnopqrstuvwxyz1234567890AB';
    const result = scrubSecrets(input);
    expect(result).toContain('[REDACTED:GitHub token]');
    expect(result).not.toContain('ghs_');
  });

  it('should scrub GitHub OAuth tokens (gho_)', () => {
    const input = 'token is gho_abcdefghijklmnopqrstuvwxyz1234567890AB';
    const result = scrubSecrets(input);
    expect(result).toContain('[REDACTED:GitHub OAuth]');
    expect(result).not.toContain('gho_');
  });

  it('should scrub AWS access keys', () => {
    const input = 'key is AKIAIOSFODNN7EXAMPLE';
    const result = scrubSecrets(input);
    expect(result).toContain('[REDACTED:AWS key]');
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('should scrub Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
    const result = scrubSecrets(input);
    expect(result).toContain('[REDACTED:Bearer token]');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('should scrub private key headers', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----';
    const result = scrubSecrets(input);
    expect(result).toContain('[REDACTED:Private key]');
    expect(result).not.toContain('BEGIN RSA PRIVATE KEY');
  });

  it('should scrub npm tokens', () => {
    const input = 'npm_abcdefghijklmnopqrstuvwxyz1234567890AB';
    const result = scrubSecrets(input);
    expect(result).toContain('[REDACTED:npm token]');
    expect(result).not.toContain('npm_');
  });

  it('should redact values for sensitive key names', () => {
    const input = { password: 'mysecretpassword', username: 'admin' };
    const result = scrubSecrets(input);
    expect(result.password).toBe('[REDACTED]');
    expect(result.username).toBe('admin');
  });

  it('should leave non-secret strings unchanged', () => {
    const input = 'this is a normal string with no secrets';
    expect(scrubSecrets(input)).toBe(input);
  });

  it('should handle nested objects recursively', () => {
    const input = {
      config: {
        auth: {
          token: 'supersecret',
          endpoint: 'https://api.example.com',
        },
      },
    };
    const result = scrubSecrets(input);
    expect(result.config.auth.token).toBe('[REDACTED]');
    expect(result.config.auth.endpoint).toBe('https://api.example.com');
  });

  it('should handle arrays', () => {
    const input = ['normal', 'Bearer eyJhbGciOiJIUzI1NiJ9.test.sig'];
    const result = scrubSecrets(input);
    expect(result[0]).toBe('normal');
    expect(result[1]).toContain('[REDACTED:Bearer token]');
  });

  it('should handle null, undefined, and numbers without crashing', () => {
    expect(scrubSecrets(null)).toBeNull();
    expect(scrubSecrets(undefined)).toBeUndefined();
    expect(scrubSecrets(42)).toBe(42);
    expect(scrubSecrets(true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Queryable session state
// ---------------------------------------------------------------------------

describe('queryable session state', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should return a complete session summary with counts', () => {
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    logEvent(sessionId, 'tool_use', { tool: 'view' });
    logEvent(sessionId, 'error', { message: 'oops' });

    const summary = getSessionSummary(sessionId);
    expect(summary).toBeDefined();
    expect(summary!.sessionId).toBe(sessionId);
    expect(summary!.repoKey).toBe('org_repo');
    expect(summary!.status).toBe('active');
    expect(summary!.eventCount).toBe(3);
    expect(summary!.toolUseCount).toBe(2);
    expect(summary!.errorCount).toBe(1);
    expect(summary!.skipCount).toBe(0);
    expect(summary!.recentEvents).toHaveLength(3);
  });

  it('should return undefined for nonexistent session', () => {
    expect(getSessionSummary('nonexistent-id')).toBeUndefined();
  });

  it('should detect whether a specific event type has occurred', () => {
    expect(hasEventOccurred(sessionId, 'tool_use')).toBe(false);

    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    expect(hasEventOccurred(sessionId, 'tool_use')).toBe(true);
    expect(hasEventOccurred(sessionId, 'review')).toBe(false);
  });

  it('should find events by type pattern', () => {
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    logEvent(sessionId, 'session_start', { repo: 'org_repo' });
    logEvent(sessionId, 'session_end', { status: 'completed' });

    const sessionEvents = findEvents(sessionId, 'session');
    expect(sessionEvents).toHaveLength(2);
    expect(sessionEvents[0].eventType).toBe('session_start');
    expect(sessionEvents[1].eventType).toBe('session_end');

    const toolEvents = findEvents(sessionId, 'tool');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].eventType).toBe('tool_use');
  });
});

// ---------------------------------------------------------------------------
// Curator state (Phase 1b)
// ---------------------------------------------------------------------------

describe('curator state', () => {
  beforeEach(() => {
    getDb(':memory:');
  });

  it('should return 0 as the initial last processed event id', () => {
    expect(getLastProcessedEventId()).toBe(0);
  });

  it('should advance the cursor position', () => {
    advanceCursor(42);
    expect(getLastProcessedEventId()).toBe(42);
  });

  it('should be idempotent — can be called multiple times', () => {
    advanceCursor(10);
    expect(getLastProcessedEventId()).toBe(10);

    advanceCursor(20);
    expect(getLastProcessedEventId()).toBe(20);

    advanceCursor(20);
    expect(getLastProcessedEventId()).toBe(20);
  });

  it('should never move cursor backward', () => {
    advanceCursor(20);
    expect(getLastProcessedEventId()).toBe(20);

    advanceCursor(10);
    expect(getLastProcessedEventId()).toBe(20);
  });

  it('should recover if curator_state row is missing', () => {
    const db = getDb();
    db.prepare('DELETE FROM curator_state WHERE id = 1').run();
    expect(getLastProcessedEventId()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Code review fixes
// ---------------------------------------------------------------------------

describe('code review fixes', () => {
  it('should scrub secrets in error messages (not just context)', () => {
    getDb(':memory:');
    const sessionId = startSession('test_repo');
    recordError(sessionId, 'auth', 'Failed with token ghp_abcdefghijklmnopqrstuvwxyz1234567890AB', {});

    const events = findEvents(sessionId, 'error');
    const payload = JSON.parse(events[0].payload);
    expect(payload.message).toContain('[REDACTED:GitHub token]');
    expect(payload.message).not.toContain('ghp_');
  });

  it('should handle circular references without crashing', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const result = scrubSecrets(circular);
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular Reference]');
  });
});
