import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

/**
 * Checks whether the current module is being run as the main script
 * (vs imported). Handles npm link symlinks via realpathSync.
 */
export function checkIsScript(importMetaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const resolvedPath = path.resolve(argv1);
  let resolvedArgv: string;
  try {
    resolvedArgv = url.pathToFileURL(fs.realpathSync(resolvedPath)).href;
  } catch {
    resolvedArgv = url.pathToFileURL(resolvedPath).href;
  }
  return importMetaUrl === resolvedArgv;
}
