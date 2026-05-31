import type { LoadedProfileSource } from '@akubly/skillsmith-runtime';
import type { ProfileStalenessReason } from '@akubly/types';

/** Profile info when a profile was found for the skill. */
export interface SkillMetricsProfileInfo {
  found: true;
  /** Which tier matched the fallback chain: per-skill, per-model, per-user, or global. */
  tier: LoadedProfileSource;
  /** session_count stored in the profile row at last update. */
  sessionCount: number;
  /** ISO-8601 timestamp of last profile update. */
  updatedAt: string;
  /** Whole days elapsed since `updatedAt`. */
  daysSinceUpdate: number;
}

export interface SkillMetricsProfileMissing {
  found: false;
}

export type SkillMetricsProfile = SkillMetricsProfileInfo | SkillMetricsProfileMissing;

/** Staleness signal for the loaded profile (null when no profile found). */
export interface SkillMetricsStaleness {
  stale: boolean;
  /** Why the profile is stale (null = fresh). See {@link ProfileStalenessReason}. */
  reason: ProfileStalenessReason;
  /** Sessions logged since the profile was last updated (count proxy). */
  sessionsSinceUpdate: number;
}

/** Confidence before and after staleness attenuation (null when no profile found). */
export interface SkillMetricsConfidence {
  /** Baseline confidence before any staleness attenuation (always 1.0 for DB profiles). */
  raw: number;
  /** Confidence after staleness attenuation (0.5× if stale, else raw). */
  attenuated: number;
  /** Whether staleness attenuation was applied. */
  isAttenuated: boolean;
}

/** One entry from the prescriber_run event log (W5-5 — may not be present). */
export interface SkillMetricsPrescriberRun {
  triggeredBy: string;
  profileSource: LoadedProfileSource | null;
  inserted: number;
  skipped: number;
  errored: number;
  totalHints: number;
  occurredAt: string;
}

/**
 * Top-level metrics snapshot for a single skill.
 * Stable schema: field additions are additive; removals require a major version bump.
 */
export interface SkillMetrics {
  skillId: string;
  /** Repo key used for session fallback lookup. null if none was resolvable. */
  repoKey: string | null;
  /** ISO-8601 timestamp at which this report was generated. */
  queriedAt: string;
  profile: SkillMetricsProfile;
  /** null when no profile found. */
  staleness: SkillMetricsStaleness | null;
  /** null when no profile found. */
  confidence: SkillMetricsConfidence | null;
  /**
   * Whether the current profile confidence is above the attenuation floor,
   * meaning auto-application of hints is currently viable.
   * null when no profile found.
   */
  autoApplyEligible: boolean | null;
  /**
   * Recent prescriber_run events for this skill (most recent first, default cap: 10).
   * null when the prescriber_run event type has not been written yet (W5-5 not landed).
   */
  recentPrescriberRuns: SkillMetricsPrescriberRun[] | null;
}
