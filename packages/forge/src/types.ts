/**
 * Forge-local type mirrors for SDK types not re-exported from the SDK index.
 *
 * WHY these exist: The @github/copilot-sdk defines hook input/output types
 * internally but does NOT re-export them from its package index. The only
 * stable public surface is `SessionConfig["hooks"]`, from which we derive
 * the composite `SessionHooks` type. The individual hook input/output shapes
 * are mirrored here so that Forge internals (bridge, composer, gates) can
 * use them without depending on SDK internals that may shift between versions.
 *
 * WHEN to update: If the SDK's SessionConfig["hooks"] shape changes, these
 * mirrors must be updated to match. Pin SDK version and audit on upgrade.
 *
 * @module
 */

import type { SessionConfig, ToolResultObject } from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// Derived hook aggregate type
// ---------------------------------------------------------------------------

/**
 * The full hooks object accepted by `SessionConfig`.
 * Derived from the SDK's public type surface rather than mirroring internals.
 */
export type SessionHooks = NonNullable<SessionConfig["hooks"]>;

// ---------------------------------------------------------------------------
// Hook input types (mirrored — SDK does not re-export these)
// ---------------------------------------------------------------------------

/** Input provided to `onPreToolUse` hooks. */
export interface PreToolUseInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
}

/** Output returned from `onPreToolUse` hooks. */
export interface PreToolUseOutput {
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  modifiedArgs?: unknown;
  additionalContext?: string;
  suppressOutput?: boolean;
}

/** Input provided to `onPostToolUse` hooks. */
export interface PostToolUseInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
  toolResult: ToolResultObject;
}

/** Output returned from `onPostToolUse` hooks. */
export interface PostToolUseOutput {
  modifiedResult?: ToolResultObject;
  additionalContext?: string;
  suppressOutput?: boolean;
}

/** Input provided to `onSessionStart` hooks. */
export interface SessionStartInput {
  timestamp: number;
  cwd: string;
  source: string;
  initialPrompt?: string;
}

/** Input provided to `onSessionEnd` hooks. */
export interface SessionEndInput {
  timestamp: number;
  cwd: string;
  reason: string;
}

/** Input provided to `onUserPromptSubmitted` hooks. */
export interface UserPromptInput {
  timestamp: number;
  cwd: string;
  prompt: string;
}

/** Input provided to `onErrorOccurred` hooks. */
export interface ErrorInput {
  timestamp: number;
  cwd: string;
  error: string;
  errorContext: string;
  recoverable: boolean;
}

/** Invocation context passed to every hook alongside the input. */
export interface HookInvocation {
  sessionId: string;
}
