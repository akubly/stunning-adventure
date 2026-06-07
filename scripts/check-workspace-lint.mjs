/**
 * check-workspace-lint.mjs
 *
 * Asserts that every workspace package with a `src/` directory has a `lint`
 * script defined in its package.json.
 *
 * Rule: A package with a `src/` directory MUST declare a `lint` script in its
 * package.json. Packages without `src/` are considered non-lintable
 * meta-packages and are exempt. This mirrors the `--if-present` behaviour of
 * the root `lint` script, but fails loudly instead of silently skipping —
 * closing the silent-skip bug class that issue #37 originally fixed at the
 * platform level.
 *
 * Exit codes:
 *   0 — all lintable packages have a lint script
 *   1 — one or more lintable packages are missing a lint script
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Read root package.json to get workspaces globs
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

// Support both array form ("workspaces": [...]) and object form ("workspaces": { "packages": [...] })
let workspaceGlobs;
if (Array.isArray(rootPkg.workspaces)) {
  workspaceGlobs = rootPkg.workspaces;
} else if (rootPkg.workspaces && Array.isArray(rootPkg.workspaces.packages)) {
  workspaceGlobs = rootPkg.workspaces.packages;
} else {
  const shape = rootPkg.workspaces === undefined ? 'missing' : JSON.stringify(rootPkg.workspaces);
  console.error('');
  console.error('check-workspace-lint: ERROR — cannot read workspace list from package.json');
  console.error('');
  console.error(`  The "workspaces" field is ${shape}.`);
  console.error('  Expected an array (["packages/*"]) or an object with a "packages" array');
  console.error('  ({ "packages": ["packages/*"] }). Resolving zero packages would');
  console.error('  silently skip all checks — failing loudly instead.');
  console.error('');
  process.exit(1);
}

// Resolve all packages matching the workspace globs
const packageDirs = [];
for (const pattern of workspaceGlobs) {
  // Support simple "packages/*" style globs — expand manually for portability
  const parts = pattern.split('/');
  if (parts.length === 2 && parts[1] === '*') {
    const parent = join(repoRoot, parts[0]);
    if (existsSync(parent)) {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          packageDirs.push(join(parent, entry.name));
        }
      }
    }
  } else if (pattern.includes('*')) {
    // Unsupported glob (e.g. "packages/**", "apps/*/plugins/*", scoped globs).
    // Silently falling through would match ZERO packages — exactly the silent-skip
    // blind spot this guard exists to prevent. Hard-fail so the maintainer knows
    // the guard needs extending (or switch to `npm query .workspace --json`).
    console.error('');
    console.error('check-workspace-lint: ERROR — unsupported workspace glob pattern');
    console.error('');
    console.error(`  Pattern "${pattern}" contains a wildcard but is not the supported`);
    console.error('  "parent/*" form. Silently resolving it as a literal path would match');
    console.error('  zero packages and recreate the silent-skip blind spot this guard prevents.');
    console.error('');
    console.error('  Extend the glob resolver in scripts/check-workspace-lint.mjs to handle');
    console.error('  this pattern, or switch to: npm query .workspace --json');
    console.error('');
    process.exit(1);
  } else {
    // No wildcard — treat as a literal path.
    const resolved = join(repoRoot, pattern);
    if (existsSync(resolved)) {
      packageDirs.push(resolved);
    }
  }
}

const missing = [];

for (const pkgDir of packageDirs) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) continue;

  const hasSrc = existsSync(join(pkgDir, 'src'));
  if (!hasSrc) continue; // non-lintable meta-package — exempt

  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const hasLint = typeof pkg?.scripts?.lint === 'string';

  if (!hasLint) {
    missing.push(pkg.name ?? pkgDir);
  }
}

if (missing.length > 0) {
  console.error('');
  console.error('check-workspace-lint: FAIL');
  console.error('');
  console.error(
    'The following packages have a src/ directory but no `lint` script in package.json.'
  );
  console.error(
    'Add a lint script to each package or the root `npm run lint` will silently skip it.'
  );
  console.error('');
  for (const name of missing) {
    console.error(`  ✗ ${name}`);
  }
  console.error('');
  process.exit(1);
} else {
  const count = packageDirs.filter((d) => existsSync(join(d, 'src'))).length;
  console.log(`check-workspace-lint: PASS — all ${count} lintable package(s) have a lint script.`);
}
