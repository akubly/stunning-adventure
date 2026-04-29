/**
 * Session Types — Pure types and functions for model/session metadata.
 *
 * Phase 2 scope: only TYPES and PURE FUNCTIONS that don't need a running SDK
 * client. Session orchestration (createSession, sendMessage, etc.) is Phase 3.
 *
 * Promoted from spike: `packages/cairn/src/spike/model-selection-poc.ts`
 *
 * @module
 */

import type { ModelInfo } from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// ReasoningEffort — SDK type not re-exported from index
// ---------------------------------------------------------------------------

/**
 * Reasoning effort levels supported by reasoning-capable models.
 * Mirrors the SDK's internal `ReasoningEffort` type which is not re-exported.
 */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

// ---------------------------------------------------------------------------
// ModelSnapshot — Forge-local model info extraction
// ---------------------------------------------------------------------------

/**
 * A Forge-local snapshot of model capabilities and metadata.
 * Extracted from the SDK's `ModelInfo` type via `toModelSnapshot()`.
 * Strips internal SDK fields, keeps what Forge/Cairn need for analytics,
 * costing, and model selection decisions.
 */
export interface ModelSnapshot {
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

// ---------------------------------------------------------------------------
// toModelSnapshot — pure extractor
// ---------------------------------------------------------------------------

/**
 * Extract a `ModelSnapshot` from the SDK's `ModelInfo` type.
 * Pure function — no side effects, no SDK client needed.
 */
export function toModelSnapshot(info: ModelInfo): ModelSnapshot {
  return {
    id: info.id,
    name: info.name,
    contextWindow: info.capabilities.limits.max_context_window_tokens,
    maxOutputTokens: info.capabilities.limits.max_prompt_tokens,
    supportsVision: info.capabilities.supports.vision,
    supportsReasoning: info.capabilities.supports.reasoningEffort,
    billingMultiplier: info.billing?.multiplier,
    policyState: info.policy?.state,
    supportedReasoningEfforts: info.supportedReasoningEfforts as
      | ReasoningEffort[]
      | undefined,
    defaultReasoningEffort: info.defaultReasoningEffort as
      | ReasoningEffort
      | undefined,
  };
}

// ---------------------------------------------------------------------------
// ModelChangeRecord — tracks model switches
// ---------------------------------------------------------------------------

/**
 * Records a model switch event within a session.
 * Captures the before/after state for audit trails and analytics.
 */
export interface ModelChangeRecord {
  timestamp: string;
  previousModel?: string;
  newModel: string;
  previousReasoningEffort?: ReasoningEffort;
  newReasoningEffort?: ReasoningEffort;
}
