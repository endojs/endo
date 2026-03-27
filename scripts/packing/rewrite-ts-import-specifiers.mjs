#!/usr/bin/env node
/**
 * @file Rewrite ".ts" import specifiers to ".js" for npm publish artifacts.
 *
 * This updates ESM import/export/require specifiers (and select declaration
 * references) in .js/.mjs/.cjs and .d.ts files so published packages never
 * reference .ts files.
 *
 * Usage (from package directory):
 *   ../../scripts/packing/rewrite-ts-import-specifiers.mjs
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const packageDir =
  args.find(arg => !arg.startsWith('-')) ||
  process.env.INIT_CWD ||
  process.cwd();

const rewriteListPath = path.join(packageDir, '.pack-rewrite-files.txt');

const shouldRewrite = specifier => {
  if (!specifier.endsWith('.ts')) return false;
  if (specifier.endsWith('.mts')) return false;
  if (specifier.endsWith('.d.ts')) return false;
  if (specifier.endsWith('.d.mts')) return false;
  if (specifier.endsWith('.d.cts')) return false;
  return true;
};

const rewriteSpecifier = specifier =>
  shouldRewrite(specifier) ? `${specifier.slice(0, -3)}.js` : specifier;

const rewriteContent = input => {
  let changed = false;
  const replaceSpec = spec => {
    const updated = rewriteSpecifier(spec);
    if (updated !== spec) changed = true;
    return updated;
  };

  let output = input;

  // from '...'
  output = output.replace(
    /(\bfrom\s*)(['"])([^'"]+)\2/g,
    (_match, prefix, quote, spec) =>
      `${prefix}${quote}${replaceSpec(spec)}${quote}`,
  );

  // import('...')
  output = output.replace(
    /(\bimport\s*\(\s*)(['"])([^'"]+)\2(\s*\))/g,
    (_match, prefix, quote, spec, suffix) =>
      `${prefix}${quote}${replaceSpec(spec)}${quote}${suffix}`,
  );

  // require('...')
  output = output.replace(
    /(\brequire\s*\(\s*)(['"])([^'"]+)\2(\s*\))/g,
    (_match, prefix, quote, spec, suffix) =>
      `${prefix}${quote}${replaceSpec(spec)}${quote}${suffix}`,
  );

  // declare module '...'
  output = output.replace(
    /(\bdeclare\s+module\s*)(['"])([^'"]+)\2/g,
    (_match, prefix, quote, spec) =>
      `${prefix}${quote}${replaceSpec(spec)}${quote}`,
  );

  // <reference path="..." />
  output = output.replace(
    /(<reference\s+path=)(['"])([^'"]+)\2/g,
    (_match, prefix, quote, spec) =>
      `${prefix}${quote}${replaceSpec(spec)}${quote}`,
  );

  return { output, changed };
};

const shouldProcessFile = filePath =>
  filePath.endsWith('.js') ||
  filePath.endsWith('.mjs') ||
  filePath.endsWith('.cjs') ||
  filePath.endsWith('.d.ts') ||
  filePath.endsWith('.d.mts') ||
  filePath.endsWith('.d.cts');

const listFiles = async rootDir => {
  /** @type {string[]} */
  const files = [];
  const stack = [rootDir];

  while (stack.length) {
    const currentDir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        stack.push(path.join(currentDir, entry.name));
      } else if (entry.isFile()) {
        const fullPath = path.join(currentDir, entry.name);
        if (shouldProcessFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }

  return files.sort();
};

const main = async () => {
  const files = await listFiles(packageDir);
  /** @type {string[]} */
  const modified = [];

  for (const filePath of files) {
    const original = await fs.readFile(filePath, 'utf-8');
    const { output, changed } = rewriteContent(original);
    if (!changed) continue;

    await fs.writeFile(filePath, output);
    modified.push(path.relative(packageDir, filePath));
  }

  if (modified.length > 0) {
    await fs.writeFile(rewriteListPath, `${modified.join('\n')}\n`);
    console.log(
      `rewrite-ts-import-specifiers: rewrote ${modified.length} file(s)`,
    );
  } else if (existsSync(rewriteListPath)) {
    await fs.unlink(rewriteListPath);
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
