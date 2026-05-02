import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { applyMigrations } from '../db/schema.js';
import { createSession, endSession, getActiveSession } from '../db/sessions.js';
import { logEvent, getUnprocessedEvents } from '../db/events.js';
import { getPreference, setPreference } from '../db/preferences.js';
import { recordSkip, getSkips } from '../db/skipBreadcrumbs.js';
import { slugifyRepoKey } from '../config/repo.js';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB_DIR = path.join(process.cwd(), '.test-temp');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

beforeEach(() => {
  closeDb();
});

afterEach(() => {
  closeDb();
});

afterAll(() => {
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

describe('database initialization', () => {
  it('should create all tables on initialization', () => {
    const db = getDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const names = tables.map((t) => t.name);
    expect(names).toContain('sessions');
    expect(names).toContain('preferences');
    expect(names).toContain('skip_breadcrumbs');
    expect(names).toContain('errors');
    expect(names).toContain('event_log');
    expect(names).toContain('schema_version');
    expect(names).toContain('prescriptions');
    expect(names).toContain('prescriber_state');
    expect(names).toContain('managed_artifacts');
  });

  it('should enable WAL mode for file-based databases', () => {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    const db = getDb(TEST_DB_PATH);
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');
  });

  it('should enable foreign keys', () => {
    const db = getDb(':memory:');
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  it('should record schema version after migration', () => {
    const db = getDb(':memory:');
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
      version: number;
    };
    expect(row.version).toBe(11);  });
});

// ---------------------------------------------------------------------------

describe('sessions', () => {
  beforeEach(() => {
    getDb(':memory:');
  });

  it('should create a session and return its id', () => {
    const id = createSession('org_repo', 'main');
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should create a session without a branch', () => {
    const id = createSession('org_repo');
    const session = getActiveSession('org_repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
    expect(session!.branch).toBeUndefined();
  });

  it('should get an active session', () => {
    const id = createSession('org_repo', 'main');
    const session = getActiveSession('org_repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
    expect(session!.repoKey).toBe('org_repo');
    expect(session!.branch).toBe('main');
    expect(session!.status).toBe('active');
    expect(session!.startedAt).toBeDefined();
    expect(session!.endedAt).toBeUndefined();
  });

  it('should end a session with default status', () => {
    const id = createSession('org_repo', 'main');
    endSession(id);
    expect(getActiveSession('org_repo')).toBeUndefined();
  });

  it('should end a session with a custom status', () => {
    const id = createSession('org_repo', 'main');
    endSession(id, 'crashed');
    expect(getActiveSession('org_repo')).toBeUndefined();

    const db = getDb();
    const row = db.prepare('SELECT status, ended_at FROM sessions WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe('crashed');
    expect(row.ended_at).toBeDefined();
  });

  it('should return undefined when no active session exists', () => {
    expect(getActiveSession('nonexistent_repo')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

describe('event log', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should log an event and return its id', () => {
    const id = logEvent(sessionId, 'tool_use', { tool: 'grep', args: ['pattern'] });
    expect(id).toBeGreaterThan(0);
  });

  it('should retrieve unprocessed events by cursor', () => {
    logEvent(sessionId, 'session_start', { repo: 'org_repo' });
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    logEvent(sessionId, 'tool_use', { tool: 'view' });

    const all = getUnprocessedEvents(0);
    expect(all).toHaveLength(3);

    const afterFirst = getUnprocessedEvents(all[0].id);
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst[0].eventType).toBe('tool_use');

    const afterSecond = getUnprocessedEvents(afterFirst[0].id);
    expect(afterSecond).toHaveLength(1);
  });

  it('should return empty array when no unprocessed events', () => {
    expect(getUnprocessedEvents(0)).toEqual([]);
  });

  it('should store and retrieve JSON payload', () => {
    const payload = { tool: 'grep', args: ['pattern'], result: { count: 5 } };
    logEvent(sessionId, 'tool_use', payload);

    const events = getUnprocessedEvents(0);
    expect(JSON.parse(events[0].payload)).toEqual(payload);
  });

  it('should map event fields correctly', () => {
    logEvent(sessionId, 'test_event', { data: 'test' });
    const event = getUnprocessedEvents(0)[0];

    expect(event.id).toBeDefined();
    expect(event.eventType).toBe('test_event');
    expect(event.sessionId).toBe(sessionId);
    expect(event.createdAt).toBeDefined();
  });

  it('should respect limit parameter', () => {
    logEvent(sessionId, 'e1', { n: 1 });
    logEvent(sessionId, 'e2', { n: 2 });
    logEvent(sessionId, 'e3', { n: 3 });

    const limited = getUnprocessedEvents(0, 2);
    expect(limited).toHaveLength(2);
    expect(limited[0].eventType).toBe('e1');
    expect(limited[1].eventType).toBe('e2');

    // Without limit returns all
    const all = getUnprocessedEvents(0);
    expect(all).toHaveLength(3);
  });

  it('should treat limit of 0 as no limit', () => {
    logEvent(sessionId, 'e1', { n: 1 });
    logEvent(sessionId, 'e2', { n: 2 });

    const result = getUnprocessedEvents(0, 0);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Preference cascade
// ---------------------------------------------------------------------------

describe('preference cascade', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should set and get a system preference', () => {
    setPreference('theme', 'dark', 'system');
    expect(getPreference('theme')).toBe('dark');
  });

  it('should set and get a user preference', () => {
    setPreference('theme', 'light', 'user');
    expect(getPreference('theme')).toBe('light');
  });

  it('should set and get a session preference', () => {
    setPreference('theme', 'auto', 'session', sessionId);
    expect(getPreference('theme', sessionId)).toBe('auto');
  });

  it('should cascade: session overrides user overrides system', () => {
    setPreference('theme', 'dark', 'system');
    expect(getPreference('theme')).toBe('dark');

    setPreference('theme', 'light', 'user');
    expect(getPreference('theme')).toBe('light');

    setPreference('theme', 'auto', 'session', sessionId);
    expect(getPreference('theme', sessionId)).toBe('auto');
  });

  it('should fall back to user when no session preference exists', () => {
    setPreference('editor', 'vim', 'user');
    expect(getPreference('editor', sessionId)).toBe('vim');
  });

  it('should fall back to system when no user or session preference exists', () => {
    setPreference('lang', 'en', 'system');
    expect(getPreference('lang', sessionId)).toBe('en');
  });

  it('should return undefined when no preference exists', () => {
    expect(getPreference('nonexistent')).toBeUndefined();
  });

  it('should update an existing preference (upsert)', () => {
    setPreference('theme', 'dark', 'user');
    expect(getPreference('theme')).toBe('dark');

    setPreference('theme', 'light', 'user');
    expect(getPreference('theme')).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// Skip breadcrumbs
// ---------------------------------------------------------------------------

describe('skip breadcrumbs', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should record a skip and return its id', () => {
    const id = recordSkip(sessionId, 'review', 'time pressure', 'code-reviewer');
    expect(id).toBeGreaterThan(0);
  });

  it('should record a skip without optional fields', () => {
    recordSkip(sessionId, 'test');
    const skips = getSkips(sessionId);
    expect(skips).toHaveLength(1);
    expect(skips[0].whatSkipped).toBe('test');
    expect(skips[0].reason).toBeUndefined();
    expect(skips[0].agent).toBeUndefined();
  });

  it('should retrieve skips for a session', () => {
    recordSkip(sessionId, 'review', 'time pressure', 'code-reviewer');
    recordSkip(sessionId, 'test', 'flaky', 'test-runner');

    const skips = getSkips(sessionId);
    expect(skips).toHaveLength(2);
    expect(skips[0].whatSkipped).toBe('review');
    expect(skips[0].reason).toBe('time pressure');
    expect(skips[0].agent).toBe('code-reviewer');
    expect(skips[1].whatSkipped).toBe('test');
  });

  it('should return empty array when no skips exist', () => {
    expect(getSkips(sessionId)).toEqual([]);
  });

  it('should map skip fields correctly', () => {
    recordSkip(sessionId, 'lint', 'not configured', 'linter');
    const skip = getSkips(sessionId)[0];

    expect(skip.id).toBeDefined();
    expect(skip.whatSkipped).toBe('lint');
    expect(skip.reason).toBe('not configured');
    expect(skip.agent).toBe('linter');
    expect(skip.sessionId).toBe(sessionId);
    expect(skip.createdAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Repo key slugification
// ---------------------------------------------------------------------------

describe('slugifyRepoKey', () => {
  it('should slugify HTTPS URLs', () => {
    expect(slugifyRepoKey('https://github.com/org/repo.git')).toBe('org_repo');
  });

  it('should slugify HTTPS URLs without .git suffix', () => {
    expect(slugifyRepoKey('https://github.com/org/repo')).toBe('org_repo');
  });

  it('should slugify SSH URLs', () => {
    expect(slugifyRepoKey('git@github.com:org/repo.git')).toBe('org_repo');
  });

  it('should slugify SSH URLs without .git suffix', () => {
    expect(slugifyRepoKey('git@github.com:org/repo')).toBe('org_repo');
  });

  it('should slugify plain org/repo format', () => {
    expect(slugifyRepoKey('org/repo')).toBe('org_repo');
  });

  it('should handle ssh:// protocol URLs', () => {
    expect(slugifyRepoKey('ssh://git@github.com/org/repo.git')).toBe('org_repo');
  });

  it('should handle whitespace', () => {
    expect(slugifyRepoKey('  org/repo  ')).toBe('org_repo');
  });
});

// ---------------------------------------------------------------------------
// Schema migration idempotency
// ---------------------------------------------------------------------------

describe('schema migration', () => {
  it('should apply migrations only once (idempotent)', () => {
    const db = getDb(':memory:');

    const before = db.prepare('SELECT COUNT(*) as count FROM schema_version').get() as {
      count: number;
    };
    expect(before.count).toBe(11);
    // Re-run should be a no-op
    applyMigrations(db);

    const after = db.prepare('SELECT COUNT(*) as count FROM schema_version').get() as {
      count: number;
    };
    expect(after.count).toBe(11);  });

  it('should record migration description', () => {
    const db = getDb(':memory:');
    const row = db.prepare('SELECT description FROM schema_version WHERE version = 1').get() as {
      description: string;
    };
    expect(row.description).toContain('Initial schema');
  });
});
