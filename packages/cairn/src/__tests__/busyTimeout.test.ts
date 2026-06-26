/**
 * Slice 2D — SQLITE_BUSY concurrency policy
 *
 * Asserts that getDb() applies both `busy_timeout = 5000` and WAL journal mode,
 * and verifies the resulting concurrent-writer behaviour: a writer with a 5-second
 * busy timeout succeeds when a competing writer releases the lock within the window,
 * while a writer with no timeout fails immediately with SQLITE_BUSY.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import Database from 'better-sqlite3';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { applyMigrations } from '../db/schema.js';

const TEST_DIR = path.join(process.cwd(), '.test-busy-timeout');
const TEST_DB_PATH = path.join(TEST_DIR, 'busy.db');

// ---------------------------------------------------------------------------
// Worker helpers
// ---------------------------------------------------------------------------

/**
 * Holds an EXCLUSIVE write lock on the given DB file until told to release.
 * Runs as a CJS eval worker (no bare-specifier resolution issues).
 * Protocol:
 *   → receives any message           → COMMITs and closes
 *   ← sends { event: 'locked' }      after BEGIN EXCLUSIVE succeeds
 *   ← sends { event: 'released' }    after COMMIT
 */
const LOCKER_SCRIPT = `
const { workerData, parentPort } = require('worker_threads');
const Database = require('better-sqlite3');
const db = new Database(workerData.dbPath);
db.pragma('journal_mode = WAL');
db.exec('BEGIN EXCLUSIVE');
parentPort.postMessage({ event: 'locked' });
parentPort.once('message', () => {
  db.exec('COMMIT');
  db.close();
  parentPort.postMessage({ event: 'released' });
});
`;

/**
 * Attempts a single INSERT against the given DB file.
 * If busyTimeout > 0, sets PRAGMA busy_timeout before writing.
 *   ← sends { event: 'started' }                          before the write
 *   ← sends { event: 'done', success, code?, message? }   after success or error
 */
const WRITER_SCRIPT = `
const { workerData, parentPort } = require('worker_threads');
const Database = require('better-sqlite3');
const db = new Database(workerData.dbPath);
db.pragma('journal_mode = WAL');
// Always set explicitly — better-sqlite3 v12 defaults to 5000 ms, so we must
// set 0 explicitly to test the "no timeout" failure path.
db.pragma('busy_timeout = ' + workerData.busyTimeout);
parentPort.postMessage({ event: 'started' });
try {
  db.prepare('INSERT INTO preferences (key, value, scope, session_id) VALUES (?, ?, ?, ?)').run(
    'busy-test-' + Date.now() + '-' + Math.random(), 'v', 'user', ''
  );
  parentPort.postMessage({ event: 'done', success: true });
} catch (err) {
  parentPort.postMessage({ event: 'done', success: false, code: err.code, message: err.message });
} finally {
  db.close();
}
`;

type WorkerMsg = Record<string, unknown>;

function waitForEvent(worker: Worker, event: string): Promise<WorkerMsg> {
  return new Promise((resolve, reject) => {
    const onMsg = (msg: WorkerMsg) => {
      if (msg.event === event) {
        worker.off('message', onMsg);
        worker.off('error', onError);
        resolve(msg);
      }
    };
    const onError = (err: Error) => {
      worker.off('message', onMsg);
      worker.off('error', onError);
      reject(err);
    };
    worker.on('message', onMsg);
    worker.on('error', onError);
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Start fresh — remove any leftover from a previous interrupted run
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const seed = new Database(TEST_DB_PATH);
  seed.pragma('journal_mode = WAL');
  seed.pragma('foreign_keys = ON');
  applyMigrations(seed);
  seed.close();
});

beforeEach(() => {
  // Reset singleton so each test that calls getDb() gets a fresh open
  closeDb();
});

afterEach(() => {
  closeDb();
});

afterAll(() => {
  closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Unit assertions: getDb() must set busy_timeout = 5000
// ---------------------------------------------------------------------------

describe('getDb() pragma policy', () => {
  it('sets busy_timeout = 5000 on a file-backed connection', () => {
    const db = getDb(TEST_DB_PATH);
    const timeout = db.pragma('busy_timeout', { simple: true });
    expect(timeout).toBe(5000);
  });

  it('sets busy_timeout = 5000 on an :memory: connection', () => {
    const db = getDb(':memory:');
    const timeout = db.pragma('busy_timeout', { simple: true });
    expect(timeout).toBe(5000);
  });

  it('WAL journal mode is still set on a file-backed connection (no regression)', () => {
    const db = getDb(TEST_DB_PATH);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });
});

// ---------------------------------------------------------------------------
// Concurrent writer integration
// Each test uses worker threads (real OS threads) so SQLite's busy-retry loop
// runs in the writer thread while the locker holds the exclusive WAL write lock.
// ---------------------------------------------------------------------------

describe('concurrent writer integration', () => {
  it(
    'write with busy_timeout = 5000 succeeds when competing writer releases within timeout',
    async () => {
      // Locker acquires exclusive write lock in its own OS thread
      const locker = new Worker(LOCKER_SCRIPT, {
        eval: true,
        workerData: { dbPath: TEST_DB_PATH },
      });
      await waitForEvent(locker, 'locked');

      // Writer (5 s busy_timeout) begins its write — will retry internally
      const writer = new Worker(WRITER_SCRIPT, {
        eval: true,
        workerData: { dbPath: TEST_DB_PATH, busyTimeout: 5000 },
      });
      // Wait until writer has begun (is at or just past the INSERT call)
      await waitForEvent(writer, 'started');

      // Release lock after 200 ms — writer should unblock and succeed
      const lockerDone = waitForEvent(locker, 'released');
      setTimeout(() => locker.postMessage('release'), 200);

      const result = await waitForEvent(writer, 'done');
      await lockerDone;

      expect(result.success).toBe(true);
    },
    10_000,
  );

  it(
    'write WITHOUT busy_timeout fails immediately when competing writer holds lock',
    async () => {
      const locker = new Worker(LOCKER_SCRIPT, {
        eval: true,
        workerData: { dbPath: TEST_DB_PATH },
      });
      await waitForEvent(locker, 'locked');

      // Writer with no busy_timeout → SQLITE_BUSY thrown without any retry
      const writer = new Worker(WRITER_SCRIPT, {
        eval: true,
        workerData: { dbPath: TEST_DB_PATH, busyTimeout: 0 },
      });

      const result = await waitForEvent(writer, 'done');

      // Release the lock regardless
      locker.postMessage('release');
      await waitForEvent(locker, 'released');

      expect(result.success).toBe(false);
      expect(result.code).toBe('SQLITE_BUSY');
    },
    10_000,
  );
});
