import { describe, it, expect } from 'vitest';
import { getCairnDir, getKnowledgeDbPath } from '../config/paths.js';
import os from 'node:os';
import path from 'node:path';

describe('paths', () => {
  it('should resolve cairn dir to home directory', () => {
    expect(getCairnDir()).toBe(path.join(os.homedir(), '.cairn'));
  });

  it('should resolve knowledge.db path', () => {
    expect(getKnowledgeDbPath()).toBe(path.join(os.homedir(), '.cairn', 'knowledge.db'));
  });
});
