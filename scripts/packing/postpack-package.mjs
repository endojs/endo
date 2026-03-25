#!/usr/bin/env node
/**
 * @file Unified postpack script for all packages.
 *
 * This script handles cleanup after npm pack completes:
 * 1. Restores .ts files that were deleted during prepack (via git checkout)
 * 2. Removes generated .d.ts, .d.ts.map, .js, and .mts files (via git clean)
 *
 * Usage: yarn run -T postpack-package (from any package directory)
 */
import fs from 'node:fs';
import path from 'node:path';
import spawn from 'nano-spawn';

// Package directory from INIT_CWD (set by yarn) or current directory
const packageDir = process.env.INIT_CWD || process.cwd();
const rewriteListPath = path.join(packageDir, '.pack-rewrite-files.txt');

console.log(`postpack-package: ${path.basename(packageDir)}`);

// Step 1: Restore any .ts files that were deleted during prepack
// git checkout only affects tracked files, so untracked generated files stay deleted
console.log('  → restoring .ts files');
try {
  await spawn('git', ['checkout', '--', '*.ts'], {
    cwd: packageDir,
    stdio: 'inherit',
  });
} catch {
  // May fail if no .ts files were tracked, which is fine
}

const getRepoRoot = async () => {
  try {
    const { stdout } = await spawn('git', ['rev-parse', '--show-toplevel'], {
      cwd: packageDir,
      stdout: 'pipe',
      stderr: 'ignore',
    });
    return stdout.trim();
  } catch {
    return null;
  }
};

const restoreRewriteList = async (listPath, gitCwd, label) => {
  if (!fs.existsSync(listPath)) return false;
  console.log(`  → restoring rewritten files (${label})`);
  try {
    const entries = fs
      .readFileSync(listPath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    if (entries.length > 0) {
      try {
        await spawn('git', ['ls-files', '-z', '--', ...entries], {
          cwd: gitCwd,
          stdout: 'pipe',
          stderr: 'inherit',
        }).pipe('xargs', ['-0', 'git', 'checkout', '--'], {
          cwd: gitCwd,
          stdout: 'inherit',
          stderr: 'inherit',
        });
      } catch {
        // Ignore failures (e.g., no tracked matches).
      }
    }
  } catch {
    // ignore failures restoring rewritten files
  }
  try {
    fs.unlinkSync(listPath);
  } catch {
    // ignore if already removed
  }
  return true;
};

// Step 1.5: Restore any files rewritten during prepack
const repoRoot = await getRepoRoot();
const repoRewriteListPath =
  repoRoot && repoRoot !== packageDir
    ? path.join(repoRoot, '.pack-rewrite-files.txt')
    : null;

const restoredLocal = await restoreRewriteList(
  rewriteListPath,
  packageDir,
  'package',
);
if (!restoredLocal && repoRewriteListPath) {
  const restoredRepo = await restoreRewriteList(
    repoRewriteListPath,
    repoRoot,
    'repo',
  );
  if (!restoredRepo) {
    console.log('  → no rewritten files list found');
  }
} else if (!restoredLocal) {
  console.log('  → no rewritten files list found');
}

// Step 2: Remove generated declaration files and .js files
// git clean only removes untracked files, so committed files are safe
console.log('  → cleaning generated files');
try {
  await spawn(
    'git',
    ['clean', '-f', '*.d.ts', '*.d.ts.map', '*.js', '*.mts', '*.d.mts.map'],
    { cwd: packageDir, stdio: 'inherit' },
  );
} catch {
  // May fail if nothing to clean, which is fine
}

console.log('postpack-package: done');
