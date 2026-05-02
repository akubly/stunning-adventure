import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { scanTopology } from '../agents/discovery.js';
import { getDb, closeDb } from '../db/index.js';
import { cacheTopology, getCachedTopology } from '../db/topologyCache.js';
import type { ArtifactTopology } from '../types/index.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-discovery-'));
}

function writeFile(relativePath: string, content: string, base: string = tmpDir): void {
  const filePath = path.join(base, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function expectedChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = makeTmpDir();
  closeDb();
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Core scanner tests
// ---------------------------------------------------------------------------

describe('scanTopology', () => {
  it('should return empty topology for empty directory', () => {
    const result = scanTopology(tmpDir);
    expect(result.artifacts).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.scannedAt).toBeTruthy();
    expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should gracefully handle missing directories', () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    const result = scanTopology(nonExistent, nonExistent, nonExistent);
    expect(result.artifacts).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('should track scan duration', () => {
    const result = scanTopology(tmpDir);
    expect(typeof result.scanDurationMs).toBe('number');
    expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should set scannedAt as ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = scanTopology(tmpDir);
    const after = new Date().toISOString();
    expect(result.scannedAt >= before).toBe(true);
    expect(result.scannedAt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 1: User-level artifacts
// ---------------------------------------------------------------------------

describe('Phase 1 — user-level scan', () => {
  it('should discover user instructions.md', () => {
    const content = '# My Instructions\nDo great things.';
    writeFile('.copilot/instructions.md', content);

    const result = scanTopology(tmpDir);
    expect(result.artifacts).toHaveLength(1);
    const art = result.artifacts[0];
    expect(art.artifactType).toBe('instruction');
    expect(art.scope).toBe('user');
    expect(art.logicalId).toBe('instructions.md');
    expect(art.resolutionRule).toBe('additive');
  });

  it('should discover user agents with YAML frontmatter name', () => {
    const content = `---
name: code-reviewer
description: Reviews code
---
# Code Reviewer
Review all PRs.`;
    writeFile('.copilot/agents/code-reviewer.agent.md', content);

    const result = scanTopology(tmpDir);
    const agents = result.artifacts.filter((a) => a.artifactType === 'agent');
    expect(agents).toHaveLength(1);
    expect(agents[0].logicalId).toBe('code-reviewer');
    expect(agents[0].scope).toBe('user');
    expect(agents[0].resolutionRule).toBe('first_found');
  });

  it('should fall back to filename for agents without frontmatter', () => {
    writeFile('.copilot/agents/my-agent.agent.md', '# My Agent\nDoes things.');

    const result = scanTopology(tmpDir);
    const agents = result.artifacts.filter((a) => a.artifactType === 'agent');
    expect(agents).toHaveLength(1);
    expect(agents[0].logicalId).toBe('my-agent');
  });

  it('should discover user skills with heading', () => {
    const content = '# Persona Review\nA skill for reviewing work.';
    writeFile('.copilot/skills/persona-review/SKILL.md', content);

    const result = scanTopology(tmpDir);
    const skills = result.artifacts.filter((a) => a.artifactType === 'skill');
    expect(skills).toHaveLength(1);
    expect(skills[0].logicalId).toBe('Persona Review');
    expect(skills[0].scope).toBe('user');
    expect(skills[0].resolutionRule).toBe('first_found');
  });

  it('should fall back to directory name for skills without heading', () => {
    writeFile('.copilot/skills/my-skill/SKILL.md', 'No heading here.');

    const result = scanTopology(tmpDir);
    const skills = result.artifacts.filter((a) => a.artifactType === 'skill');
    expect(skills).toHaveLength(1);
    expect(skills[0].logicalId).toBe('my-skill');
  });

  it('should discover user hooks', () => {
    writeFile('.copilot/hooks/cairn-archivist/hooks.json', '{"type":"preToolUse"}');

    const result = scanTopology(tmpDir);
    const hooks = result.artifacts.filter((a) => a.artifactType === 'hook');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].logicalId).toBe('cairn-archivist');
    expect(hooks[0].scope).toBe('user');
    expect(hooks[0].resolutionRule).toBe('additive');
  });

  it('should discover user MCP servers', () => {
    const mcpConfig = JSON.stringify({
      mcpServers: {
        memory: { command: 'memory-server' },
        'sequential-thinking': { command: 'think-server' },
      },
    });
    writeFile('.copilot/mcp-config.json', mcpConfig);

    const result = scanTopology(tmpDir);
    const mcpServers = result.artifacts.filter((a) => a.artifactType === 'mcp_server');
    expect(mcpServers).toHaveLength(2);
    expect(mcpServers.map((s) => s.logicalId).sort()).toEqual(['memory', 'sequential-thinking']);
    expect(mcpServers[0].resolutionRule).toBe('last_wins');
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Project-level artifacts
// ---------------------------------------------------------------------------

describe('Phase 2 — project-level scan', () => {
  it('should discover project copilot-instructions.md', () => {
    const projectDir = path.join(tmpDir, 'project');
    const content = '# Project Instructions';
    writeFile('.github/copilot-instructions.md', content, projectDir);

    const result = scanTopology(tmpDir, projectDir);
    const instructions = result.artifacts.filter((a) => a.artifactType === 'instruction');
    expect(instructions).toHaveLength(1);
    expect(instructions[0].scope).toBe('project');
    expect(instructions[0].logicalId).toBe('copilot-instructions.md');
  });

  it('should discover project agents', () => {
    const projectDir = path.join(tmpDir, 'project');
    writeFile(
      '.github/agents/reviewer.agent.md',
      '---\nname: reviewer\n---\n# Reviewer',
      projectDir,
    );

    const result = scanTopology(tmpDir, projectDir);
    const agents = result.artifacts.filter((a) => a.artifactType === 'agent');
    expect(agents).toHaveLength(1);
    expect(agents[0].scope).toBe('project');
    expect(agents[0].logicalId).toBe('reviewer');
  });

  it('should discover project extensions as hooks', () => {
    const projectDir = path.join(tmpDir, 'project');
    writeFile('.github/extensions/my-hook.ts', 'export default {}', projectDir);

    const result = scanTopology(tmpDir, projectDir);
    const hooks = result.artifacts.filter((a) => a.artifactType === 'hook');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].scope).toBe('project');
    expect(hooks[0].logicalId).toBe('my-hook');
  });

  it('should discover project MCP config from .copilot/mcp-config.json', () => {
    const projectDir = path.join(tmpDir, 'project');
    const mcpConfig = JSON.stringify({ mcpServers: { cairn: { command: 'node' } } });
    writeFile('.copilot/mcp-config.json', mcpConfig, projectDir);

    const result = scanTopology(tmpDir, projectDir);
    const mcpServers = result.artifacts.filter((a) => a.artifactType === 'mcp_server');
    expect(mcpServers).toHaveLength(1);
    expect(mcpServers[0].logicalId).toBe('cairn');
    expect(mcpServers[0].scope).toBe('project');
  });

  it('should discover project MCP config from .copilot/mcp.json', () => {
    const projectDir = path.join(tmpDir, 'project');
    const mcpConfig = JSON.stringify({ servers: { tools: { command: 'serve' } } });
    writeFile('.copilot/mcp.json', mcpConfig, projectDir);

    const result = scanTopology(tmpDir, projectDir);
    const mcpServers = result.artifacts.filter((a) => a.artifactType === 'mcp_server');
    expect(mcpServers).toHaveLength(1);
    expect(mcpServers[0].logicalId).toBe('tools');
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Installed plugins
// ---------------------------------------------------------------------------

describe('Phase 3 — installed plugin scan', () => {
  it('should discover plugin manifests', () => {
    const pluginsDir = path.join(tmpDir, 'plugins');
    writeFile('my-plugin/plugin.json', JSON.stringify({ name: 'my-plugin', version: '1.0.0' }), pluginsDir);

    const result = scanTopology(tmpDir, undefined, pluginsDir);
    const manifests = result.artifacts.filter((a) => a.artifactType === 'plugin_manifest');
    expect(manifests).toHaveLength(1);
    expect(manifests[0].logicalId).toBe('my-plugin');
    expect(manifests[0].ownerPlugin).toBe('my-plugin');
  });

  it('should use plugin.json name for ownerPlugin over directory name', () => {
    const pluginsDir = path.join(tmpDir, 'plugins');
    writeFile(
      'some-dir/plugin.json',
      JSON.stringify({ name: 'actual-plugin-name', version: '1.0.0' }),
      pluginsDir,
    );
    writeFile(
      'some-dir/agents/helper.agent.md',
      '---\nname: helper\n---\n# Helper',
      pluginsDir,
    );

    const result = scanTopology(tmpDir, undefined, pluginsDir);
    const agents = result.artifacts.filter((a) => a.artifactType === 'agent');
    expect(agents).toHaveLength(1);
    expect(agents[0].ownerPlugin).toBe('actual-plugin-name');
  });

  it('should discover plugin agents and skills', () => {
    const pluginsDir = path.join(tmpDir, 'plugins');
    writeFile('test-plugin/plugin.json', JSON.stringify({ name: 'test-plugin' }), pluginsDir);
    writeFile(
      'test-plugin/agents/code-review.agent.md',
      '---\nname: code-review\n---\n# Code Review Agent',
      pluginsDir,
    );
    writeFile(
      'test-plugin/skills/tdd/SKILL.md',
      '# TDD Workflow\nTest-driven development skill.',
      pluginsDir,
    );

    const result = scanTopology(tmpDir, undefined, pluginsDir);
    const agents = result.artifacts.filter((a) => a.artifactType === 'agent');
    const skills = result.artifacts.filter((a) => a.artifactType === 'skill');

    expect(agents).toHaveLength(1);
    expect(agents[0].logicalId).toBe('code-review');
    expect(agents[0].ownerPlugin).toBe('test-plugin');
    expect(agents[0].scope).toBe('plugin');

    expect(skills).toHaveLength(1);
    expect(skills[0].logicalId).toBe('TDD Workflow');
    expect(skills[0].ownerPlugin).toBe('test-plugin');
  });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe('conflict detection', () => {
  it('should detect conflict when same agent name at user + project scope', () => {
    const projectDir = path.join(tmpDir, 'project');
    writeFile('.copilot/agents/reviewer.agent.md', '---\nname: reviewer\n---\n# R');
    writeFile('.github/agents/reviewer.agent.md', '---\nname: reviewer\n---\n# R', projectDir);

    const result = scanTopology(tmpDir, projectDir);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].logicalId).toBe('reviewer');
    expect(result.conflicts[0].artifactType).toBe('agent');
    expect(result.conflicts[0].artifacts).toHaveLength(2);
  });

  it('should NOT detect conflicts for additive types (instructions)', () => {
    const projectDir = path.join(tmpDir, 'project');
    writeFile('.copilot/instructions.md', '# User instructions');
    writeFile('.github/copilot-instructions.md', '# Project instructions', projectDir);

    const result = scanTopology(tmpDir, projectDir);
    const instructions = result.artifacts.filter((a) => a.artifactType === 'instruction');
    expect(instructions).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it('should NOT detect conflicts for additive hooks', () => {
    const projectDir = path.join(tmpDir, 'project');
    writeFile('.copilot/hooks/my-hook/hooks.json', '{}');
    writeFile('.github/extensions/my-hook.ts', 'export default {}', projectDir);

    const result = scanTopology(tmpDir, projectDir);
    const hooks = result.artifacts.filter((a) => a.artifactType === 'hook');
    expect(hooks).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Resolution rules
// ---------------------------------------------------------------------------

describe('resolution rule assignment', () => {
  it('should assign correct resolution rules per artifact type', () => {
    const projectDir = path.join(tmpDir, 'project');
    const pluginsDir = path.join(tmpDir, 'plugins');

    writeFile('.copilot/instructions.md', '# I');
    writeFile('.copilot/agents/a.agent.md', '---\nname: a\n---\n# A');
    writeFile('.copilot/skills/s/SKILL.md', '# S');
    writeFile('.copilot/hooks/h/hooks.json', '{}');
    writeFile('.copilot/mcp-config.json', JSON.stringify({ mcpServers: { m: {} } }));
    writeFile('.github/copilot-instructions.md', '# PI', projectDir);
    writeFile('p/plugin.json', JSON.stringify({ name: 'p' }), pluginsDir);

    const result = scanTopology(tmpDir, projectDir, pluginsDir);

    const byType = new Map<string, string>();
    for (const art of result.artifacts) {
      byType.set(art.artifactType, art.resolutionRule);
    }

    expect(byType.get('instruction')).toBe('additive');
    expect(byType.get('agent')).toBe('first_found');
    expect(byType.get('skill')).toBe('first_found');
    expect(byType.get('hook')).toBe('additive');
    expect(byType.get('mcp_server')).toBe('last_wins');
    expect(byType.get('plugin_manifest')).toBe('first_found');
  });
});

// ---------------------------------------------------------------------------
// Checksum computation
// ---------------------------------------------------------------------------

describe('checksum computation', () => {
  it('should compute deterministic SHA-256 checksums', () => {
    const content = 'Hello, Cairn!';
    writeFile('.copilot/instructions.md', content);

    const result = scanTopology(tmpDir);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].checksum).toBe(expectedChecksum(content));
  });

  it('should produce different checksums for different content', () => {
    const projectDir = path.join(tmpDir, 'project');
    writeFile('.copilot/instructions.md', 'Content A');
    writeFile('.github/copilot-instructions.md', 'Content B', projectDir);

    const result = scanTopology(tmpDir, projectDir);
    const checksums = result.artifacts.map((a) => a.checksum);
    expect(checksums[0]).not.toBe(checksums[1]);
  });
});

// ---------------------------------------------------------------------------
// Logical identity extraction
// ---------------------------------------------------------------------------

describe('logical identity extraction', () => {
  it('should extract agent name from YAML frontmatter', () => {
    const content = `---
name: "my-cool-agent"
description: Does cool things
model: gpt-4
---

# My Cool Agent

System prompt here.`;
    writeFile('.copilot/agents/whatever.agent.md', content);

    const result = scanTopology(tmpDir);
    const agents = result.artifacts.filter((a) => a.artifactType === 'agent');
    expect(agents[0].logicalId).toBe('my-cool-agent');
  });

  it('should extract skill name from first heading', () => {
    const content = `# Expert TypeScript Developer

A skill for writing TypeScript.

## Usage
Use this when writing TS code.`;
    writeFile('.copilot/skills/ts-dev/SKILL.md', content);

    const result = scanTopology(tmpDir);
    const skills = result.artifacts.filter((a) => a.artifactType === 'skill');
    expect(skills[0].logicalId).toBe('Expert TypeScript Developer');
  });

  it('should extract MCP server keys from config', () => {
    const config = {
      mcpServers: {
        'github-mcp': { command: 'github-mcp-server' },
        memory: { command: 'memory-server' },
      },
    };
    writeFile('.copilot/mcp-config.json', JSON.stringify(config));

    const result = scanTopology(tmpDir);
    const servers = result.artifacts.filter((a) => a.artifactType === 'mcp_server');
    const ids = servers.map((s) => s.logicalId).sort();
    expect(ids).toEqual(['github-mcp', 'memory']);
  });
});

// ---------------------------------------------------------------------------
// Marketplace (Phase 4)
// ---------------------------------------------------------------------------

describe('Phase 4 — marketplace metadata', () => {
  it('should include marketplace artifacts in topology but not in conflicts', () => {
    const pluginsDir = path.join(tmpDir, 'plugins');
    writeFile('.copilot/marketplace-cache/awesome-copilot.json', JSON.stringify({ name: 'awesome' }));
    writeFile('awesome/plugin.json', JSON.stringify({ name: 'awesome' }), pluginsDir);

    const result = scanTopology(tmpDir, undefined, pluginsDir);
    const manifests = result.artifacts.filter((a) => a.artifactType === 'plugin_manifest');
    expect(manifests).toHaveLength(2);
    // No conflict because marketplace artifacts are excluded from conflict detection
    expect(result.conflicts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mixed topology
// ---------------------------------------------------------------------------

describe('mixed topology', () => {
  it('should scan all four phases together', () => {
    const projectDir = path.join(tmpDir, 'project');
    const pluginsDir = path.join(tmpDir, 'plugins');

    // Phase 1
    writeFile('.copilot/instructions.md', '# User');
    writeFile('.copilot/agents/agent1.agent.md', '---\nname: agent1\n---\n# A1');

    // Phase 2
    writeFile('.github/copilot-instructions.md', '# Project', projectDir);
    writeFile('.github/agents/agent2.agent.md', '---\nname: agent2\n---\n# A2', projectDir);

    // Phase 3
    writeFile('p1/plugin.json', JSON.stringify({ name: 'p1' }), pluginsDir);
    writeFile('p1/agents/agent3.agent.md', '---\nname: agent3\n---\n# A3', pluginsDir);

    // Phase 4
    writeFile('.copilot/marketplace-cache/cache.json', '{}');

    const result = scanTopology(tmpDir, projectDir, pluginsDir);

    expect(result.artifacts.length).toBeGreaterThanOrEqual(7);
    const types = new Set(result.artifacts.map((a) => a.artifactType));
    expect(types.has('instruction')).toBe(true);
    expect(types.has('agent')).toBe(true);
    expect(types.has('plugin_manifest')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Topology cache
// ---------------------------------------------------------------------------

describe('topology cache', () => {
  it('should cache and retrieve topology within TTL', () => {
    const topology: ArtifactTopology = {
      artifacts: [],
      conflicts: [],
      scannedAt: new Date().toISOString(),
      scanDurationMs: 42,
    };

    cacheTopology(topology);
    const cached = getCachedTopology();

    expect(cached).not.toBeNull();
    expect(cached!.scanDurationMs).toBe(42);
    expect(cached!.artifacts).toEqual([]);
    expect(cached!.conflicts).toEqual([]);
  });

  it('should return null when no cache exists', () => {
    const cached = getCachedTopology();
    expect(cached).toBeNull();
  });

  it('should return null when cache has expired', () => {
    const topology: ArtifactTopology = {
      artifacts: [],
      conflicts: [],
      scannedAt: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
      scanDurationMs: 10,
    };

    cacheTopology(topology);
    // Use a very short TTL to force expiry
    const cached = getCachedTopology(1);
    expect(cached).toBeNull();
  });

  it('should overwrite previous cache entry', () => {
    const topology1: ArtifactTopology = {
      artifacts: [],
      conflicts: [],
      scannedAt: new Date().toISOString(),
      scanDurationMs: 1,
    };
    const topology2: ArtifactTopology = {
      artifacts: [],
      conflicts: [],
      scannedAt: new Date().toISOString(),
      scanDurationMs: 2,
    };

    cacheTopology(topology1);
    cacheTopology(topology2);
    const cached = getCachedTopology();

    expect(cached).not.toBeNull();
    expect(cached!.scanDurationMs).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Migration verification
// ---------------------------------------------------------------------------

describe('migration 007', () => {
  it('should create topology_cache table', () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toContain('topology_cache');
  });

  it('should record schema version 9', () => {
    const db = getDb();
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
      version: number;
    };
    expect(row.version).toBe(11);
  });
});
