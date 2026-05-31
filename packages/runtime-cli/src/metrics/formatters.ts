import type { SkillMetrics } from './types.js';

// ---------------------------------------------------------------------------
// JSON formatter
// ---------------------------------------------------------------------------

export function formatJson(metrics: SkillMetrics): string {
  return JSON.stringify(metrics, null, 2);
}

// ---------------------------------------------------------------------------
// Table formatter
// ---------------------------------------------------------------------------

const COL_WIDTH = 32;

function row(label: string, value: string): string {
  return `  ${label.padEnd(COL_WIDTH)}${value}`;
}

function section(title: string): string {
  return `\n${title}\n${'─'.repeat(COL_WIDTH + 20)}`;
}

function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

export function formatTable(metrics: SkillMetrics): string {
  const lines: string[] = [];

  lines.push(section('Identity'));
  lines.push(row('Skill ID', metrics.skillId));
  lines.push(row('Repo Key', metrics.repoKey ?? '(none)'));
  lines.push(row('Queried At', metrics.queriedAt));

  lines.push(section('Profile'));
  if (!metrics.profile.found) {
    lines.push(row('Found', 'false — no profile for this skill'));
  } else {
    lines.push(row('Found', 'true'));
    lines.push(row('Tier', metrics.profile.tier));
    lines.push(row('Session Count', String(metrics.profile.sessionCount)));
    lines.push(row('Updated At', metrics.profile.updatedAt));
    lines.push(row('Days Since Update', String(metrics.profile.daysSinceUpdate)));
  }

  lines.push(section('Staleness'));
  if (!metrics.staleness) {
    lines.push(row('', '(no profile)'));
  } else {
    lines.push(row('Stale', String(metrics.staleness.stale)));
    lines.push(row('Reason', metrics.staleness.reason ?? '—'));
    lines.push(row('Sessions Since Update', String(metrics.staleness.sessionsSinceUpdate)));
  }

  lines.push(section('Confidence'));
  if (!metrics.confidence) {
    lines.push(row('', '(no profile)'));
  } else {
    lines.push(row('Raw', fmt(metrics.confidence.raw)));
    lines.push(row('Attenuated', fmt(metrics.confidence.attenuated)));
    lines.push(row('Is Attenuated', String(metrics.confidence.isAttenuated)));
  }

  lines.push(section('Auto-Apply'));
  lines.push(row('Eligible', metrics.autoApplyEligible === null ? '(no profile)' : String(metrics.autoApplyEligible)));

  lines.push(section('Recent Prescriber Runs'));
  if (metrics.recentPrescriberRuns === null) {
    lines.push(row('', '(W5-5 not landed — prescriber_run events not present)'));
  } else if (metrics.recentPrescriberRuns.length === 0) {
    lines.push(row('', '(none recorded for this skill)'));
  } else {
    for (const run of metrics.recentPrescriberRuns) {
      lines.push(`  ─ ${run.occurredAt}  triggered=${run.triggeredBy}  ` +
        `profile=${run.profileSource ?? 'unknown'}  ` +
        `inserted=${run.inserted}  skipped=${run.skipped}  errored=${run.errored}  total=${run.totalHints}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
