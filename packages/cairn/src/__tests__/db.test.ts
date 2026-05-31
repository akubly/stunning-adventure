import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { applyMigrations } from '../db/schema.js';
import {
  createSession,
  endSession,
  ensureSystemSession,
  getActiveSession,
  getActiveUserSession,
  getMostRecentActiveSession,
  getMostRecentUserSession,
  SYSTEM_SESSION_REPO_KEY,
} from '../db/sessions.js';
import { logEvent, getUnprocessedEvents } from '../db/events.js';
import { getPreference, setPreference } from '../db/preferences.js';
import { recordSkip, getSkips } from '../db/skipBreadcrumbs.js';
import { slugifyRepoKey } from '../config/repo.js';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

let db: ReturnType<typeof getDb>;


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
    db = getDb(':memory:');
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
    db = getDb(TEST_DB_PATH);
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');
  });

  it('should enable foreign keys', () => {
    db = getDb(':memory:');
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  it('should record schema version after migration', () => {
    db = getDb(':memory:');
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
      version: number;
    };
    expect(row.version).toBe(17);
  });
});

// ---------------------------------------------------------------------------

describe('sessions', () => {
  beforeEach(() => {
    db = getDb(':memory:');
  });

  it('should create a session and return its id', () => {
    const id = createSession(db, 'org_repo', 'main');
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should create a session without a branch', () => {
    const id = createSession(db, 'org_repo');
    const session = getActiveSession(db, 'org_repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
    expect(session!.branch).toBeUndefined();
  });

  it('should get an active session', () => {
    const id = createSession(db, 'org_repo', 'main');
    const session = getActiveSession(db, 'org_repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
    expect(session!.repoKey).toBe('org_repo');
    expect(session!.branch).toBe('main');
    expect(session!.status).toBe('active');
    expect(session!.kind).toBe('user');
    expect(session!.startedAt).toBeDefined();
    expect(session!.endedAt).toBeUndefined();
  });

  it('should end a session with default status', () => {
    const id = createSession(db, 'org_repo', 'main');
    endSession(db, id);
    expect(getActiveSession(db, 'org_repo')).toBeUndefined();
  });

  it('should end a session with a custom status', () => {
    const id = createSession(db, 'org_repo', 'main');
    endSession(db, id, 'crashed');
    expect(getActiveSession(db, 'org_repo')).toBeUndefined();

    db = getDb();
    const row = db.prepare('SELECT status, ended_at FROM sessions WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe('crashed');
    expect(row.ended_at).toBeDefined();
  });

  it('should return undefined when no active session exists', () => {
    expect(getActiveSession(db, 'nonexistent_repo')).toBeUndefined();
  });

  it('should create system sessions with system kind', () => {
    const db = getDb();
    const systemId = ensureSystemSession(db);

    const row = db.prepare('SELECT repo_key, session_kind FROM sessions WHERE id = ?').get(systemId) as {
      repo_key: string;
      session_kind: string;
    };

    expect(row.repo_key).toBe(SYSTEM_SESSION_REPO_KEY);
    expect(row.session_kind).toBe('system');
  });

  it('should exclude system sessions from most recent user session lookup', () => {
    const db = getDb();
    const userId = createSession(db, 'org_user_repo', 'main');
    const systemId = ensureSystemSession(db);

    db.prepare("UPDATE sessions SET started_at = '2026-05-25 10:00:00' WHERE id = ?").run(userId);
    db.prepare("UPDATE sessions SET started_at = '2026-05-25 11:00:00' WHERE id = ?").run(systemId);

    expect(getMostRecentActiveSession(db)!.id).toBe(systemId);
    const userSession = getMostRecentUserSession(db);
    expect(userSession!.id).toBe(userId);
    expect(userSession!.kind).toBe('user');
  });

  it('should exclude system sessions from repo-scoped user session lookup', () => {
    const db = getDb();
    const userId = createSession(db, 'org_scoped_repo', 'main');
    const systemId = ensureSystemSession(db, 'org_scoped_repo');

    db.prepare("UPDATE sessions SET started_at = '2026-05-25 10:00:00' WHERE id = ?").run(userId);
    db.prepare("UPDATE sessions SET started_at = '2026-05-25 11:00:00' WHERE id = ?").run(systemId);

    expect(getActiveSession(db, 'org_scoped_repo')!.id).toBe(userId);
    const userSession = getActiveUserSession(db, 'org_scoped_repo');
    expect(userSession!.id).toBe(userId);
    expect(userSession!.kind).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

describe('event log', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should log an event and return its id', () => {
    const id = logEvent(db, sessionId, 'tool_use', { tool: 'grep', args: ['pattern'] });
    expect(id).toBeGreaterThan(0);
  });

  it('should retrieve unprocessed events by cursor', () => {
    logEvent(db, sessionId, 'session_start', { repo: 'org_repo' });
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    logEvent(db, sessionId, 'tool_use', { tool: 'view' });

    const all = getUnprocessedEvents(db, 0);
    expect(all).toHaveLength(3);

    const afterFirst = getUnprocessedEvents(db, all[0].id);
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst[0].eventType).toBe('tool_use');

    const afterSecond = getUnprocessedEvents(db, afterFirst[0].id);
    expect(afterSecond).toHaveLength(1);
  });

  it('should return empty array when no unprocessed events', () => {
    expect(getUnprocessedEvents(db, 0)).toEqual([]);
  });

  it('should store and retrieve JSON payload', () => {
    const payload = { tool: 'grep', args: ['pattern'], result: { count: 5 } };
    logEvent(db, sessionId, 'tool_use', payload);

    const events = getUnprocessedEvents(db, 0);
    expect(JSON.parse(events[0].payload)).toEqual(payload);
  });

  it('should map event fields correctly', () => {
    logEvent(db, sessionId, 'test_event', { data: 'test' });
    const event = getUnprocessedEvents(db, 0)[0];

    expect(event.id).toBeDefined();
    expect(event.eventType).toBe('test_event');
    expect(event.sessionId).toBe(sessionId);
    expect(event.createdAt).toBeDefined();
  });

  it('should respect limit parameter', () => {
    logEvent(db, sessionId, 'e1', { n: 1 });
    logEvent(db, sessionId, 'e2', { n: 2 });
    logEvent(db, sessionId, 'e3', { n: 3 });

    const limited = getUnprocessedEvents(db, 0, 2);
    expect(limited).toHaveLength(2);
    expect(limited[0].eventType).toBe('e1');
    expect(limited[1].eventType).toBe('e2');

    // Without limit returns all
    const all = getUnprocessedEvents(db, 0);
    expect(all).toHaveLength(3);
  });

  it('should treat limit of 0 as no limit', () => {
    logEvent(db, sessionId, 'e1', { n: 1 });
    logEvent(db, sessionId, 'e2', { n: 2 });

    const result = getUnprocessedEvents(db, 0, 0);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Preference cascade
// ---------------------------------------------------------------------------

describe('preference cascade', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should set and get a system preference', () => {
    setPreference(db, 'theme', 'dark', 'system');
    expect(getPreference(db, 'theme')).toBe('dark');
  });

  it('should set and get a user preference', () => {
    setPreference(db, 'theme', 'light', 'user');
    expect(getPreference(db, 'theme')).toBe('light');
  });

  it('should set and get a session preference', () => {
    setPreference(db, 'theme', 'auto', 'session', sessionId);
    expect(getPreference(db, 'theme', sessionId)).toBe('auto');
  });

  it('should cascade: session overrides user overrides system', () => {
    setPreference(db, 'theme', 'dark', 'system');
    expect(getPreference(db, 'theme')).toBe('dark');

    setPreference(db, 'theme', 'light', 'user');
    expect(getPreference(db, 'theme')).toBe('light');

    setPreference(db, 'theme', 'auto', 'session', sessionId);
    expect(getPreference(db, 'theme', sessionId)).toBe('auto');
  });

  it('should fall back to user when no session preference exists', () => {
    setPreference(db, 'editor', 'vim', 'user');
    expect(getPreference(db, 'editor', sessionId)).toBe('vim');
  });

  it('should fall back to system when no user or session preference exists', () => {
    setPreference(db, 'lang', 'en', 'system');
    expect(getPreference(db, 'lang', sessionId)).toBe('en');
  });

  it('should return undefined when no preference exists', () => {
    expect(getPreference(db, 'nonexistent')).toBeUndefined();
  });

  it('should update an existing preference (upsert)', () => {
    setPreference(db, 'theme', 'dark', 'user');
    expect(getPreference(db, 'theme')).toBe('dark');

    setPreference(db, 'theme', 'light', 'user');
    expect(getPreference(db, 'theme')).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// Skip breadcrumbs
// ---------------------------------------------------------------------------

describe('skip breadcrumbs', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should record a skip and return its id', () => {
    const id = recordSkip(db, sessionId, 'review', 'time pressure', 'code-reviewer');
    expect(id).toBeGreaterThan(0);
  });

  it('should record a skip without optional fields', () => {
    recordSkip(db, sessionId, 'test');
    const skips = getSkips(db, sessionId);
    expect(skips).toHaveLength(1);
    expect(skips[0].whatSkipped).toBe('test');
    expect(skips[0].reason).toBeUndefined();
    expect(skips[0].agent).toBeUndefined();
  });

  it('should retrieve skips for a session', () => {
    recordSkip(db, sessionId, 'review', 'time pressure', 'code-reviewer');
    recordSkip(db, sessionId, 'test', 'flaky', 'test-runner');

    const skips = getSkips(db, sessionId);
    expect(skips).toHaveLength(2);
    expect(skips[0].whatSkipped).toBe('review');
    expect(skips[0].reason).toBe('time pressure');
    expect(skips[0].agent).toBe('code-reviewer');
    expect(skips[1].whatSkipped).toBe('test');
  });

  it('should return empty array when no skips exist', () => {
    expect(getSkips(db, sessionId)).toEqual([]);
  });

  it('should map skip fields correctly', () => {
    recordSkip(db, sessionId, 'lint', 'not configured', 'linter');
    const skip = getSkips(db, sessionId)[0];

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
    db = getDb(':memory:');

    const before = db.prepare('SELECT COUNT(*) as count FROM schema_version').get() as {
      count: number;
    };
    expect(before.count).toBe(17);
    // Re-run should be a no-op
    applyMigrations(db);

    const after = db.prepare('SELECT COUNT(*) as count FROM schema_version').get() as {
      count: number;
    };
    expect(after.count).toBe(17);
  });

  it('migration 014 should backfill __system__ sessions as system kind', () => {
    const db = new Database(':memory:');
    try {
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now')),
          description TEXT
        );
        INSERT INTO schema_version (version, description) VALUES (13, 'pre-014 test schema');
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          repo_key TEXT NOT NULL,
          branch TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          ended_at TEXT,
          status TEXT NOT NULL DEFAULT 'active'
        );
        INSERT INTO sessions (id, repo_key, branch) VALUES ('user-session', 'org/repo', 'main');
        INSERT INTO sessions (id, repo_key, branch) VALUES ('system-session', '__system__', 'main');
      `);

      applyMigrations(db);

      const rows = db.prepare('SELECT id, session_kind FROM sessions ORDER BY id').all() as Array<{
        id: string;
        session_kind: string;
      }>;
      expect(rows).toEqual([
        { id: 'system-session', session_kind: 'system' },
        { id: 'user-session', session_kind: 'user' },
      ]);
    } finally {
      db.close();
    }
  });

  it('should record migration description', () => {
    db = getDb(':memory:');
    const row = db.prepare('SELECT description FROM schema_version WHERE version = 1').get() as {
      description: string;
    };
    expect(row.description).toContain('Initial schema');
  });
});
