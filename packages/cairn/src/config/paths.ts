import path from 'node:path';
import os from 'node:os';

export function getCairnDir(): string {
  return path.join(os.homedir(), '.cairn');
}

export function getKnowledgeDbPath(): string {
  return path.join(getCairnDir(), 'knowledge.db');
}

export function getPluginsDir(): string {
  return path.join(getCairnDir(), 'plugins');
}

export function getConfigPath(): string {
  return path.join(getCairnDir(), 'config.json');
}
