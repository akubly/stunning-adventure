import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { checkIsScript } from '../utils/isScript.js';

describe('checkIsScript', () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
  });

  it('returns false when argv[1] is missing', () => {
    process.argv = [process.argv[0]];
    expect(checkIsScript('file:///whatever/index.ts')).toBe(false);
  });

  it('returns true when import.meta.url matches resolved argv[1]', () => {
    const scriptPath = path.resolve('/app/src/main.ts');
    const fileUrl = url.pathToFileURL(scriptPath).href;

    process.argv = [process.argv[0], scriptPath];
    vi.spyOn(fs, 'realpathSync').mockReturnValue(scriptPath);

    expect(checkIsScript(fileUrl)).toBe(true);
  });

  it('returns true when argv[1] is a symlink resolved to the real path', () => {
    const symlinkPath = path.resolve('/usr/local/bin/cairn');
    const realPath = path.resolve('/app/dist/main.js');
    const realFileUrl = url.pathToFileURL(realPath).href;

    process.argv = [process.argv[0], symlinkPath];
    vi.spyOn(fs, 'realpathSync').mockReturnValue(realPath);

    expect(checkIsScript(realFileUrl)).toBe(true);
  });
});
