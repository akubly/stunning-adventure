import type Database from 'better-sqlite3';
import {
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
  querySignalSamples,
} from '@akubly/cairn';
import {
  ForgeClient,
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
  copilotClientOptions?: CopilotClientOptions;
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
}

function createRealSdkClientAdapter(options: CopilotClientOptions = {}): SDKClient {
  const client = new CopilotClient(options);
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
  const sdkClient = options.sdkClient ?? createRealSdkClientAdapter({
    cwd: options.workingDirectory,
    ...options.copilotClientOptions,
  });
  const telemetryTimings: TelemetryTimingEvent[] = [];
  const forgeClient = new ForgeClient({
    sdkClient,
    clientName: options.clientName ?? 'forge-run-session',
  });

  let session: Awaited<ReturnType<ForgeClient['createSession']>> | null = null;
  try {
    session = await forgeClient.createSession({
      skillId: options.skillId,
      telemetrySink,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      workingDirectory: options.workingDirectory,
      onPermissionRequest: options.onPermissionRequest,
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
    await session.disconnect();

    if (options.buildProfile ?? true) {
      buildProfiles(db);
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
    };
  } finally {
    try {
      if (session && !session.isDisconnected) {
        await session.disconnect();
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
