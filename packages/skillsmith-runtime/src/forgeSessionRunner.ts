import type Database from 'better-sqlite3';
import {
  approveAll,
  CopilotClient,
  type CopilotClientOptions,
  type PermissionHandler,
  type ResumeSessionConfig,
  type SessionConfig,
  type SessionEvent,
} from '@github/copilot-sdk';
import {
  buildProfiles,
  closeDb,
  getDb,
  getExecutionProfile,
  loadDBOMArtifact,
  querySignalSamples,
  upsertDBOM,
} from '@akubly/cairn';
import {
  ForgeClient,
  generateDBOM,
  type ForgeSessionConfig,
  type SDKClient,
  type SDKSession,
  type TelemetryTimingEvent,
} from '@akubly/forge';
import { createCairnTelemetrySink } from './telemetry.js';

export interface RunForgeInstrumentedSessionOptions {
  prompt: string;
  skillId: string;
  db?: Database.Database;
  dbPath?: string;
  model?: string;
  reasoningEffort?: ForgeSessionConfig['reasoningEffort'];
  workingDirectory?: string;
  timeoutMs?: number;
  clientName?: string;
  onPermissionRequest?: PermissionHandler;
  onTelemetryTiming?: (event: TelemetryTimingEvent) => void;
  sdkClient?: SDKClient;
  /**
   * Developer-only Copilot SDK construction options.
   *
   * Do not pass tokens, credentials, or user-provided auth material here; the
   * runner intentionally relies on the SDK's ambient auth flow and sanitizes
   * construction errors before they reach CLI output.
   */
  copilotClientOptions?: CopilotClientOptions;
  /** Stop an injected SDK client when the run finishes. Defaults to false. */
  stopClientOnFinish?: boolean;
  buildProfile?: boolean;
  closeDbOnFinish?: boolean;
}

export interface RunForgeInstrumentedSessionResult {
  sessionId: string;
  responseEvent: SessionEvent | undefined;
  bridgeEventCount: number;
  signalSamplesWritten: number;
  profileFound: boolean;
  profileSessionCount: number | null;
  telemetryTimings: TelemetryTimingEvent[];
  /**
   * Best-effort disconnect cleanup status. A failed disconnect remains observable
   * here but does not change the sample-written success contract.
   */
  disconnect: { ok: true } | { ok: false; error: string };
  /**
   * Root hash of the DBOM artifact for this session.
   *
   * - Non-null (64-char SHA-256 hex) in all cases where DBOM generation succeeded.
   *   When no certification-tier events exist, this is the deterministic empty-set
   *   sentinel hash (SHA-256 of the empty string). When at least one certification
   *   event was captured, this is the real chain root hash and the artifact was
   *   persisted to the database.
   * - Null only when DBOM generation or persistence itself threw (malformed payload
   *   or a storage failure). See `dbomPersistError` for the error message.
   */
  dbomRootHash: string | null;
  /**
   * Non-null when DBOM generation or persistence failed; the run result is still
   * valid (best-effort provenance). Null when DBOM was generated successfully
   * (whether or not any certification events existed).
   */
  dbomPersistError: string | null;
}

function createRealSdkClientAdapter(options: CopilotClientOptions = {}): SDKClient {
  let client: CopilotClient;
  try {
    client = new CopilotClient(options);
  } catch {
    throw new Error('Copilot SDK client could not be constructed. Check Copilot CLI authentication and SDK availability.');
  }
  return {
    createSession: (config: Partial<SessionConfig>): Promise<SDKSession> =>
      client.createSession(config as SessionConfig) as Promise<SDKSession>,
    resumeSession: ({ sessionId, ...config }): Promise<SDKSession> =>
      client.resumeSession(sessionId, config as ResumeSessionConfig) as Promise<SDKSession>,
    stop: async (): Promise<void> => {
      const errors = await client.stop();
      if (errors.length > 0) {
        throw new AggregateError(errors, 'CopilotClient.stop() reported errors');
      }
    },
  };
}

function resolveDb(options: RunForgeInstrumentedSessionOptions): Database.Database {
  if (options.db) return options.db;
  return getDb(options.dbPath);
}

function ownsResolvedDb(options: RunForgeInstrumentedSessionOptions): boolean {
  return !options.db;
}

/**
 * Composition root for one instrumented Forge session.
 *
 * This is intentionally outside the runtime-cli command so a future production
 * harness can reuse the same SDK → Forge → Cairn wiring without copying CLI
 * argument parsing or console formatting.
 */
export async function runForgeInstrumentedSession(
  options: RunForgeInstrumentedSessionOptions,
): Promise<RunForgeInstrumentedSessionResult> {
  const db = resolveDb(options);
  const ownsDb = ownsResolvedDb(options);
  const telemetrySink = createCairnTelemetrySink(db);
  const sdkClientWasInjected = options.sdkClient !== undefined;
  const sdkClient = options.sdkClient ?? createRealSdkClientAdapter({
    cwd: options.workingDirectory,
    ...options.copilotClientOptions,
  });
  const ownsSdkClient = options.stopClientOnFinish ?? !sdkClientWasInjected;
  const telemetryTimings: TelemetryTimingEvent[] = [];
  const forgeClient = new ForgeClient({
    sdkClient,
    clientName: options.clientName ?? 'forge-session-runner',
    ownsSdkClient,
  });

  let session: Awaited<ReturnType<ForgeClient['createSession']>> | null = null;
  let disconnectAttempted = false;
  let disconnect: RunForgeInstrumentedSessionResult['disconnect'] = { ok: true };
  try {
    session = await forgeClient.createSession({
      skillId: options.skillId,
      telemetrySink,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      workingDirectory: options.workingDirectory,
      onPermissionRequest: options.onPermissionRequest ?? approveAll,
      onTelemetryTiming: (event) => {
        telemetryTimings.push(event);
        options.onTelemetryTiming?.(event);
      },
    });

    let responseEvent: SessionEvent | undefined;
    try {
      responseEvent = await session.sendAndWait(options.prompt, options.timeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Forge session ${session.sessionId} failed while waiting for response: ${message}`,
        { cause: error },
      );
    }
    disconnectAttempted = true;
    try {
      await session.disconnect();
    } catch (error) {
      disconnect = { ok: false, error: error instanceof Error ? error.message : String(error) };
      console.warn('[skillsmith-runtime] Forge session disconnect failed after telemetry flush', error);
    }

    if (options.buildProfile ?? true) {
      buildProfiles(db);
    }

    // Generate DBOM from bridge events captured during this session.
    // Best-effort: a failure here never throws out of the runner (consistent with
    // the disconnect-failure contract). dbomRootHash is the sentinel empty-set hash
    // when no certification-tier events exist; null only when generation threw.
    let dbomRootHash: string | null = null;
    let dbomPersistError: string | null = null;
    try {
      const bridgeEvents = [...session.getBridgeEvents()];
      const dbomArtifact = generateDBOM(session.sessionId, bridgeEvents);
      dbomRootHash = dbomArtifact.rootHash;
      const hasCertificationEvents = dbomArtifact.stats.totalDecisions > 0;
      if (hasCertificationEvents) {
        upsertDBOM(db, dbomArtifact);
        console.debug('[skillsmith-runtime] DBOM persisted: ' + dbomRootHash.slice(0, 8) + '… (' + dbomArtifact.stats.totalDecisions + ' decisions)');
      } else {
        console.debug('[skillsmith-runtime] DBOM empty (no certification events) for session ' + session.sessionId + '; sentinel hash, not persisted');
      }
    } catch (e) {
      dbomPersistError = e instanceof Error ? e.message : String(e);
      console.warn('[skillsmith-runtime] DBOM generation/persistence failed; run result unaffected', e);
    }

    const samples = querySignalSamples(db, { sessionId: session.sessionId });
    const profile = getExecutionProfile(db, options.skillId, 'per-skill', 'global');
    return {
      sessionId: session.sessionId,
      responseEvent,
      bridgeEventCount: session.getBridgeEvents().length,
      signalSamplesWritten: samples.length,
      profileFound: profile !== null,
      profileSessionCount: profile?.sessionCount ?? null,
      telemetryTimings: [...telemetryTimings],
      disconnect,
      dbomRootHash,
      dbomPersistError,
    };
  } finally {
    try {
      if (session && !session.isDisconnected && !disconnectAttempted) {
        try {
          await session.disconnect();
        } catch (err) {
          console.warn('[skillsmith-runtime] Forge session cleanup disconnect failed', err);
        }
      }
    } finally {
      await forgeClient.stop().catch((err) => {
        console.warn('[skillsmith-runtime] ForgeClient stop failed', err);
      });
      if (options.closeDbOnFinish && ownsDb) {
        closeDb();
      }
    }
  }
}
