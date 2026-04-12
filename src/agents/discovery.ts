/**
 * Artifact Discovery Scanner
 *
 * Pure-function scanner that maps the Copilot CLI installation topology.
 * Discovers artifacts across three scopes — user, project, and plugin —
 * computes checksums, extracts logical identities, assigns resolution rules,
 * and detects conflicts. Marketplace metadata is scanned as read-only
 * reference data within the plugin scope and excluded from conflict detection.
 *
 * No side effects beyond reading the filesystem.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  ArtifactType,
  ArtifactScope,
  ResolutionRule,
  DiscoveredArtifact,
  ArtifactConflict,
  ArtifactTopology,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Resolution rules per artifact type (DP2)
// ---------------------------------------------------------------------------

const RESOLUTION_RULES: Record<ArtifactType, ResolutionRule> = {
  instruction: 'additive',
  hook: 'additive',
  agent: 'first_found',
  skill: 'first_found',
  command: 'first_found',
  mcp_server: 'last_wins',
  plugin_manifest: 'first_found',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function safeReaddir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function dirExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Extract YAML frontmatter `name:` from an .agent.md file.
 * Falls back to the filename (without .agent.md extension) on parse failure.
 */
function extractAgentName(content: string, filePath: string): string {
  const fmMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const nameMatch = fmMatch[1].match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
    if (nameMatch) return nameMatch[1].trim();
  }
  return path.basename(filePath, '.agent.md');
}

/**
 * Extract the first `# Heading` from a SKILL.md file.
 * Falls back to the parent directory name on parse failure.
 */
function extractSkillName(content: string, filePath: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  return path.basename(path.dirname(filePath));
}

function makeArtifact(
  filePath: string,
  artifactType: ArtifactType,
  scope: ArtifactScope,
  logicalId: string,
  content: string,
  stat: fs.Stats,
  ownerPlugin?: string,
): DiscoveredArtifact {
  return {
    path: filePath,
    artifactType,
    scope,
    logicalId,
    ownerPlugin,
    checksum: sha256(content),
    lastModified: stat.mtimeMs,
    resolutionRule: RESOLUTION_RULES[artifactType],
  };
}

// ---------------------------------------------------------------------------
// Phase scanners
// ---------------------------------------------------------------------------

/**
 * Phase 1: User-level artifacts (~/.copilot/).
 */
function scanUserLevel(homedir: string): DiscoveredArtifact[] {
  const copilotDir = path.join(homedir, '.copilot');
  if (!dirExists(copilotDir)) return [];

  const artifacts: DiscoveredArtifact[] = [];

  // instructions.md
  const instructionsPath = path.join(copilotDir, 'instructions.md');
  const instructionsContent = safeReadFile(instructionsPath);
  const instructionsStat = safeStat(instructionsPath);
  if (instructionsContent !== null && instructionsStat) {
    artifacts.push(
      makeArtifact(instructionsPath, 'instruction', 'user', 'instructions.md', instructionsContent, instructionsStat),
    );
  }

  // agents/*.agent.md
  const agentsDir = path.join(copilotDir, 'agents');
  for (const entry of safeReaddir(agentsDir)) {
    if (!entry.endsWith('.agent.md')) continue;
    const filePath = path.join(agentsDir, entry);
    const content = safeReadFile(filePath);
    const stat = safeStat(filePath);
    if (content !== null && stat && stat.isFile()) {
      const logicalId = extractAgentName(content, filePath);
      artifacts.push(makeArtifact(filePath, 'agent', 'user', logicalId, content, stat));
    }
  }

  // skills/*/SKILL.md
  const skillsDir = path.join(copilotDir, 'skills');
  for (const entry of safeReaddir(skillsDir)) {
    const skillFilePath = path.join(skillsDir, entry, 'SKILL.md');
    const content = safeReadFile(skillFilePath);
    const stat = safeStat(skillFilePath);
    if (content !== null && stat && stat.isFile()) {
      const logicalId = extractSkillName(content, skillFilePath);
      artifacts.push(makeArtifact(skillFilePath, 'skill', 'user', logicalId, content, stat));
    }
  }

  // hooks/* (directories are hook artifacts)
  const hooksDir = path.join(copilotDir, 'hooks');
  for (const entry of safeReaddir(hooksDir)) {
    const hookDirPath = path.join(hooksDir, entry);
    const stat = safeStat(hookDirPath);
    if (stat && stat.isDirectory()) {
      // Use hooks.json content for checksum if it exists, else the directory name
      const hooksJsonPath = path.join(hookDirPath, 'hooks.json');
      const content = safeReadFile(hooksJsonPath) ?? entry;
      const fileStat = safeStat(hooksJsonPath) ?? stat;
      artifacts.push(makeArtifact(hookDirPath, 'hook', 'user', entry, content, fileStat));
    }
  }

  // MCP config (mcp-config.json)
  const mcpConfigPath = path.join(copilotDir, 'mcp-config.json');
  const mcpContent = safeReadFile(mcpConfigPath);
  if (mcpContent !== null) {
    const mcpStat = safeStat(mcpConfigPath);
    if (mcpStat) {
      try {
        const config = JSON.parse(mcpContent) as Record<string, unknown>;
        const servers = (
          config.mcpServers ?? config.servers ?? config
        ) as Record<string, unknown>;
        for (const key of Object.keys(servers)) {
          // Skip the container key itself when iterating the top-level config
          if (servers === config && (key === 'mcpServers' || key === 'servers')) continue;
          artifacts.push(
            makeArtifact(mcpConfigPath, 'mcp_server', 'user', key, JSON.stringify(servers[key]), mcpStat),
          );
        }
      } catch {
        // Malformed JSON — skip
      }
    }
  }

  return artifacts;
}

/**
 * Phase 2: Project-level artifacts (.github/).
 */
function scanProjectLevel(projectRoot: string): DiscoveredArtifact[] {
  const artifacts: DiscoveredArtifact[] = [];

  // .github/ artifacts (instructions, agents, skills, extensions)
  const githubDir = path.join(projectRoot, '.github');
  if (dirExists(githubDir)) {
    // copilot-instructions.md
    const instructionsPath = path.join(githubDir, 'copilot-instructions.md');
    const instructionsContent = safeReadFile(instructionsPath);
    const instructionsStat = safeStat(instructionsPath);
    if (instructionsContent !== null && instructionsStat) {
      artifacts.push(
        makeArtifact(
          instructionsPath,
          'instruction',
          'project',
          'copilot-instructions.md',
          instructionsContent,
          instructionsStat,
        ),
      );
    }

    // agents/*.agent.md
    const agentsDir = path.join(githubDir, 'agents');
    for (const entry of safeReaddir(agentsDir)) {
      if (!entry.endsWith('.agent.md')) continue;
      const filePath = path.join(agentsDir, entry);
      const content = safeReadFile(filePath);
      const stat = safeStat(filePath);
      if (content !== null && stat && stat.isFile()) {
        const logicalId = extractAgentName(content, filePath);
        artifacts.push(makeArtifact(filePath, 'agent', 'project', logicalId, content, stat));
      }
    }

    // skills/*/SKILL.md
    const skillsDir = path.join(githubDir, 'skills');
    for (const entry of safeReaddir(skillsDir)) {
      const skillFilePath = path.join(skillsDir, entry, 'SKILL.md');
      const content = safeReadFile(skillFilePath);
      const stat = safeStat(skillFilePath);
      if (content !== null && stat && stat.isFile()) {
        const logicalId = extractSkillName(content, skillFilePath);
        artifacts.push(makeArtifact(skillFilePath, 'skill', 'project', logicalId, content, stat));
      }
    }

    // extensions/*.ts → hook artifacts
    const extensionsDir = path.join(githubDir, 'extensions');
    for (const entry of safeReaddir(extensionsDir)) {
      if (!entry.endsWith('.ts')) continue;
      const filePath = path.join(extensionsDir, entry);
      const content = safeReadFile(filePath);
      const stat = safeStat(filePath);
      if (content !== null && stat && stat.isFile()) {
        const logicalId = path.basename(entry, '.ts');
        artifacts.push(makeArtifact(filePath, 'hook', 'project', logicalId, content, stat));
      }
    }
  }

  // Project MCP config (.copilot/) — scanned independently of .github/
  for (const mcpFilename of ['mcp.json', 'mcp-config.json']) {
    const mcpPath = path.join(projectRoot, '.copilot', mcpFilename);
    const mcpContent = safeReadFile(mcpPath);
    if (mcpContent === null) continue;
    const mcpStat = safeStat(mcpPath);
    if (!mcpStat) continue;
    try {
      const config = JSON.parse(mcpContent) as Record<string, unknown>;
      const servers = (
        config.mcpServers ?? config.servers ?? config
      ) as Record<string, unknown>;
      for (const key of Object.keys(servers)) {
        // Skip the container key itself when iterating the top-level config
        if (servers === config && (key === 'mcpServers' || key === 'servers')) continue;
        artifacts.push(
          makeArtifact(mcpPath, 'mcp_server', 'project', key, JSON.stringify(servers[key]), mcpStat),
        );
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  return artifacts;
}

/**
 * Phase 3: Installed plugins (~/.copilot/installed-plugins/).
 */
function scanInstalledPlugins(pluginsDir: string): DiscoveredArtifact[] {
  if (!dirExists(pluginsDir)) return [];

  const artifacts: DiscoveredArtifact[] = [];

  for (const pluginEntry of safeReaddir(pluginsDir)) {
    const pluginPath = path.join(pluginsDir, pluginEntry);
    const pluginStat = safeStat(pluginPath);
    if (!pluginStat || !pluginStat.isDirectory()) continue;

    // Determine ownerPlugin from plugin.json name, fallback to directory name
    let ownerPlugin = pluginEntry;
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const manifestContent = safeReadFile(manifestPath);
    const manifestStat = safeStat(manifestPath);

    if (manifestContent !== null && manifestStat) {
      try {
        const manifest = JSON.parse(manifestContent) as Record<string, unknown>;
        if (typeof manifest.name === 'string' && manifest.name) {
          ownerPlugin = manifest.name;
        }
        artifacts.push(
          makeArtifact(manifestPath, 'plugin_manifest', 'plugin', ownerPlugin, manifestContent, manifestStat, ownerPlugin),
        );
      } catch {
        // Malformed manifest — use directory name
        artifacts.push(
          makeArtifact(manifestPath, 'plugin_manifest', 'plugin', ownerPlugin, manifestContent, manifestStat, ownerPlugin),
        );
      }
    }

    // agents/*.agent.md
    const agentsDir = path.join(pluginPath, 'agents');
    for (const entry of safeReaddir(agentsDir)) {
      if (!entry.endsWith('.agent.md')) continue;
      const filePath = path.join(agentsDir, entry);
      const content = safeReadFile(filePath);
      const stat = safeStat(filePath);
      if (content !== null && stat && stat.isFile()) {
        const logicalId = extractAgentName(content, filePath);
        artifacts.push(makeArtifact(filePath, 'agent', 'plugin', logicalId, content, stat, ownerPlugin));
      }
    }

    // skills/*/SKILL.md
    const skillsDir = path.join(pluginPath, 'skills');
    for (const entry of safeReaddir(skillsDir)) {
      const skillFilePath = path.join(skillsDir, entry, 'SKILL.md');
      const content = safeReadFile(skillFilePath);
      const stat = safeStat(skillFilePath);
      if (content !== null && stat && stat.isFile()) {
        const logicalId = extractSkillName(content, skillFilePath);
        artifacts.push(makeArtifact(skillFilePath, 'skill', 'plugin', logicalId, content, stat, ownerPlugin));
      }
    }
  }

  return artifacts;
}

/**
 * Phase 4: Marketplace metadata (~/.copilot/marketplace-cache/).
 * Read-only reference data — included for topology completeness but
 * excluded from conflict detection.
 */
function scanMarketplace(homedir: string): DiscoveredArtifact[] {
  const cacheDir = path.join(homedir, '.copilot', 'marketplace-cache');
  if (!dirExists(cacheDir)) return [];

  const artifacts: DiscoveredArtifact[] = [];

  for (const entry of safeReaddir(cacheDir)) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(cacheDir, entry);
    const content = safeReadFile(filePath);
    const stat = safeStat(filePath);
    if (content !== null && stat && stat.isFile()) {
      const logicalId = path.basename(entry, '.json');
      artifacts.push(makeArtifact(filePath, 'plugin_manifest', 'plugin', logicalId, content, stat));
    }
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Detect conflicts: artifacts with the same (logicalId, artifactType) across
 * different scopes. Additive types (instruction, hook) never conflict.
 * Marketplace artifacts (Phase 4) are excluded from conflict detection.
 */
function detectConflicts(
  artifacts: DiscoveredArtifact[],
  marketplaceArtifacts: DiscoveredArtifact[],
): ArtifactConflict[] {
  const marketplacePaths = new Set(marketplaceArtifacts.map((a) => a.path));
  const groups = new Map<string, DiscoveredArtifact[]>();

  for (const artifact of artifacts) {
    // Skip marketplace artifacts from conflict detection
    if (marketplacePaths.has(artifact.path)) continue;
    // Additive types never conflict
    if (artifact.resolutionRule === 'additive') continue;

    const key = `${artifact.artifactType}::${artifact.logicalId}`;
    const group = groups.get(key);
    if (group) {
      group.push(artifact);
    } else {
      groups.set(key, [artifact]);
    }
  }

  const conflicts: ArtifactConflict[] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    conflicts.push({
      logicalId: group[0].logicalId,
      artifactType: group[0].artifactType,
      artifacts: group,
    });
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan the Copilot CLI installation topology across all four phases.
 *
 * Pure function — reads the filesystem but produces no side effects.
 * Missing directories are handled gracefully (empty results).
 *
 * @param homedir - User home directory (for ~/.copilot/)
 * @param projectRoot - Project root directory (for .github/), optional
 * @param pluginsDir - Override for installed plugins directory, optional
 */
export function scanTopology(
  homedir: string,
  projectRoot?: string,
  pluginsDir?: string,
): ArtifactTopology {
  const startTime = Date.now();

  // Phase 1: User-level
  const userArtifacts = scanUserLevel(homedir);

  // Phase 2: Project-level
  const projectArtifacts = projectRoot ? scanProjectLevel(projectRoot) : [];

  // Phase 3: Installed plugins
  const resolvedPluginsDir = pluginsDir ?? path.join(homedir, '.copilot', 'installed-plugins');
  const pluginArtifacts = scanInstalledPlugins(resolvedPluginsDir);

  // Phase 4: Marketplace metadata (reference only)
  const marketplaceArtifacts = scanMarketplace(homedir);

  const allArtifacts = [...userArtifacts, ...projectArtifacts, ...pluginArtifacts, ...marketplaceArtifacts];
  const conflicts = detectConflicts(allArtifacts, marketplaceArtifacts);

  return {
    artifacts: allArtifacts,
    conflicts,
    scannedAt: new Date().toISOString(),
    scanDurationMs: Date.now() - startTime,
  };
}
