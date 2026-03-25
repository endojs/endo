#!/usr/bin/env node
/**
 * @file Unified postpack script for all packages.
 *
 * This script handles cleanup after npm pack completes:
 * 1. Restores .ts files that were deleted during prepack (via git checkout)
 * 2. Restores files that had import specifiers rewritten during prepack
 * 3. Removes generated .d.ts, .d.ts.map, and .js files (via git clean)
 *
 * Usage: yarn run -T postpack-package (from any package directory)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Package directory from INIT_CWD (set by yarn) or current directory
const packageDir = process.env.INIT_CWD || process.cwd();
const rewriteListPath = path.join(packageDir, '.pack-rewrite-files.txt');

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: packageDir, stdio: 'inherit', ...opts });

console.log(`postpack-package: ${path.basename(packageDir)}`);

// Step 1: Restore any .ts files that were deleted during prepack
// git checkout only affects tracked files, so untracked generated files stay deleted
console.log('  → restoring .ts files');
try {
  run('git', ['checkout', '--', 'src']);
} catch {
  // May fail if src/ doesn't exist or no files were tracked, which is fine
}

// Step 2: Restore any files rewritten during prepack (import specifiers)
if (fs.existsSync(rewriteListPath)) {
  console.log('  → restoring rewritten files');
  try {
    const entries = fs
      .readFileSync(rewriteListPath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    for (const entry of entries) {
      try {
        run('git', ['checkout', '--', entry]);
      } catch {
        // file may be generated (not tracked), skip it
      }
    }
  } catch {
    // ignore failures restoring rewritten files
  }
  try {
    fs.unlinkSync(rewriteListPath);
  } catch {
    // ignore if already removed
  }
}

// Step 3: Remove generated files (both untracked and gitignored)
// git clean only removes untracked/ignored files, so committed files are safe
console.log('  → cleaning generated files');
try {
  // Clean gitignored files (e.g. .d.ts, .d.ts.map, .tsbuildinfo) except node_modules
  run('git', ['clean', '-fX', '-e', 'node_modules/']);
} catch {
  // May fail if nothing to clean
}
try {
  // Clean untracked generated .js files (from build-ts-to-js)
  run('git', ['clean', '-f', '*.js', 'src/']);
} catch {
  // May fail if nothing to clean, which is fine
}

console.log('postpack-package: done');
