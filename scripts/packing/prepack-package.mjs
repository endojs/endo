#!/usr/bin/env node
/**
 * @file Unified prepack script for all packages.
 *
 * This script handles the prepack lifecycle for npm publishing:
 * 1. Runs tsc --build to generate .d.ts declaration files
 * 2. Runs build-ts-to-js to generate .js from .ts files (no-op if no .ts files)
 * 3. Deletes .ts source files so they're not included in the package
 * 4. Rewrites .ts import specifiers to .js in published artifacts
 *
 * Note: tsc must run BEFORE build-ts-to-js, otherwise tsc sees both .ts and .js
 * files and fails with "would be overwritten by multiple input files".
 *
 * If tsconfig.build.json has an outDir, steps 2-3 are skipped because tsc
 * handles the full build (source stays in src/, output goes to outDir).
 *
 * After npm pack completes, postpack-package.mjs restores the deleted .ts files.
 *
 * Usage: yarn run -T prepack-package (from any package directory)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const buildTsToJs = path.join(scriptsDir, 'build-ts-to-js.mjs');
const rewriteTsImportSpecifiers = path.join(
  scriptsDir,
  'rewrite-ts-import-specifiers.mjs',
);

// Package directory from INIT_CWD (set by yarn) or current directory
const packageDir = process.env.INIT_CWD || process.cwd();
const tsconfigPath = path.join(packageDir, 'tsconfig.build.json');

/**
 * Check if tsconfig.build.json has outDir set.
 * If so, tsc handles the full build and we skip build-ts-to-js.
 */
function hasOutDir() {
  if (!existsSync(tsconfigPath)) return false;
  try {
    // tsconfig files can have comments, so strip them before parsing
    const content = readFileSync(tsconfigPath, 'utf-8')
      .replace(/\/\/.*$/gm, '') // strip single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip multi-line comments
      .replace(/,(\s*[}\]])/g, '$1'); // strip trailing commas
    const tsconfig = JSON.parse(content);
    return Boolean(tsconfig.compilerOptions?.outDir);
  } catch {
    return false;
  }
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: packageDir, stdio: 'inherit', ...opts });

const usesOutDir = hasOutDir();

console.log(`prepack-package: ${path.basename(packageDir)}`);

// Step 0: Clean stale build artifacts (gitignored files like .d.ts from prior builds)
console.log('  → cleaning stale build artifacts');
try {
  run('git', ['clean', '-fX', '-e', 'node_modules/', 'src/']);
} catch {
  // May fail if src/ doesn't exist
}

// Step 1: Generate .d.ts declarations (requires tsconfig.build.json)
if (existsSync(tsconfigPath)) {
  console.log('  → tsc --build tsconfig.build.json');
  run('yarn', ['run', '-T', 'tsc', '--build', 'tsconfig.build.json']);
} else {
  console.log('  → skipping tsc (no tsconfig.build.json)');
}

// Steps 2-3 only apply when tsc doesn't handle the full build (no outDir)
if (usesOutDir) {
  console.log('  → skipping build-ts-to-js (tsc uses outDir)');
} else {
  // Step 2: Generate .js from .ts (no-op if no .ts files exist)
  console.log('  → build-ts-to-js');
  run(process.execPath, [buildTsToJs]);

  // Step 3: Delete .ts source files (they'll be restored in postpack)
  // This ensures only .js files are included in the published package.
  // Tracked .ts files will be restored by git checkout in postpack.
  console.log('  → removing .ts source files from src/');
  try {
    run('find', ['src', '-name', '*.ts', '!', '-name', '*.d.ts', '-delete']);
  } catch {
    // find may fail if src/ doesn't exist, which is fine
  }
}

// Step 4: Rewrite .ts import specifiers to .js in published artifacts
console.log('  → rewrite .ts import specifiers');
run(process.execPath, [rewriteTsImportSpecifiers]);

console.log('prepack-package: done');
