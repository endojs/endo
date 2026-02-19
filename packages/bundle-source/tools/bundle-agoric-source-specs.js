#!/usr/bin/env node
// @ts-check
/* global process */

import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseArgs } from 'util';

const options = /** @type {const} */ ({
  'agoric-sdk-root': { type: 'string' },
  'out-dir': { type: 'string' },
  format: { type: 'string' },
  condition: { type: 'string', multiple: true },
  'dry-run': { type: 'boolean' },
  verbose: { type: 'boolean' },
});

const usage = `\
Usage:
  node tools/bundle-agoric-source-specs.js [--agoric-sdk-root <path>] [--out-dir <path>] [--format <moduleFormat>] [--condition <name>]... [--dry-run] [--verbose]

Defaults:
  --agoric-sdk-root /opt/agoric/agoric-sdk
  --out-dir ./agoric-source-spec-bundles
  --format endoZipBase64
`;

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
const exists = async filePath => {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
const findSourceSpecRegistryFiles = async root => {
  /** @type {string[]} */
  const found = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.shift();
    if (!dir) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name === 'source-spec-registry.js') {
        found.push(fullPath);
      }
    }
  }
  return found.sort();
};

/**
 * @param {unknown} value
 * @returns {Record<string, any> | undefined}
 */
const toRecord = value => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return /** @type {Record<string, any>} */ (value);
  }
  return undefined;
};

/**
 * @param {string} filePath
 * @param {Record<string, unknown>} moduleNs
 * @returns {Array<{
 *   registryFile: string;
 *   registryExport: string;
 *   key: string;
 *   bundleName: string;
 *   sourceSpec: string;
 *   packagePath?: string;
 * }>}
 */
const collectSpecsFromModule = (filePath, moduleNs) => {
  /** @type {Array<{
 *   registryFile: string;
 *   registryExport: string;
 *   key: string;
 *   bundleName: string;
 *   sourceSpec: string;
 *   packagePath?: string;
 * }>} */
  const collected = [];
  for (const [exportName, exportValue] of Object.entries(moduleNs)) {
    const maybeRegistry = toRecord(exportValue);
    if (!maybeRegistry) {
      continue;
    }
    for (const [key, descriptorMaybe] of Object.entries(maybeRegistry)) {
      const descriptor = toRecord(descriptorMaybe);
      if (!descriptor) {
        continue;
      }
      if (typeof descriptor.sourceSpec !== 'string') {
        continue;
      }
      const bundleName =
        typeof descriptor.bundleName === 'string'
          ? descriptor.bundleName
          : key;
      const packagePath =
        typeof descriptor.packagePath === 'string'
          ? descriptor.packagePath
          : undefined;
      collected.push({
        registryFile: filePath,
        registryExport: exportName,
        key,
        bundleName,
        sourceSpec: descriptor.sourceSpec,
        packagePath,
      });
    }
  }
  return collected;
};

/**
 * @param {string} text
 * @returns {string}
 */
const sanitizeName = text =>
  text.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');

const main = async () => {
  const {
    values: {
      'agoric-sdk-root': agoricSdkRoot = '/opt/agoric/agoric-sdk',
      'out-dir': outDir = path.resolve(process.cwd(), 'agoric-source-spec-bundles'),
      format = 'endoZipBase64',
      condition: conditions = [],
      'dry-run': dryRun = false,
      verbose = false,
    },
    positionals,
  } = parseArgs({ options, allowPositionals: true });

  if (positionals.length > 0) {
    throw new Error(`Unexpected arguments: ${positionals.join(' ')}\n\n${usage}`);
  }

  if (!(await exists(agoricSdkRoot))) {
    throw new Error(`agoric-sdk root does not exist: ${agoricSdkRoot}`);
  }

  const registryFiles = await findSourceSpecRegistryFiles(agoricSdkRoot);
  if (registryFiles.length === 0) {
    throw new Error(
      `No source-spec-registry.js files found under: ${agoricSdkRoot}`,
    );
  }

  /** @type {Array<{
 *   registryFile: string;
 *   registryExport: string;
 *   key: string;
 *   bundleName: string;
 *   sourceSpec: string;
 *   packagePath?: string;
 * }>} */
  const allSpecs = [];
  for (const registryFile of registryFiles) {
    // eslint-disable-next-line no-await-in-loop
    const moduleNs = await import(pathToFileURL(registryFile).href);
    allSpecs.push(...collectSpecsFromModule(registryFile, moduleNs));
  }

  if (allSpecs.length === 0) {
    throw new Error(`No bundle source specs discovered.\n\n${usage}`);
  }

  /** @type {Map<string, typeof allSpecs[number]>} */
  const deduped = new Map();
  for (const spec of allSpecs) {
    const dedupeKey = `${spec.sourceSpec}::${spec.bundleName}`;
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, spec);
    }
  }
  const specs = [...deduped.values()];

  if (!dryRun) {
    await fs.mkdir(outDir, { recursive: true });
  }

  /** @type {typeof import('../src/index.js').default | undefined} */
  let bundleSourceFn = undefined;
  if (!dryRun) {
    ({ default: bundleSourceFn } = await import('../src/index.js'));
  }

  /** @type {Array<{
 *   id: string;
 *   bundleFile: string;
 *   sourceSpec: string;
 *   bundleName: string;
 *   registryFile: string;
 *   registryExport: string;
 *   key: string;
 *   packagePath?: string;
 * }>} */
  const manifestEntries = [];

  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const registryPackage = path.basename(path.dirname(spec.registryFile));
    const id = sanitizeName(`${registryPackage}-${spec.bundleName}-${spec.key}`);
    const bundleFile = `${id}.bundle.json`;
    if (verbose || dryRun) {
      process.stdout.write(
        `[${index + 1}/${specs.length}] ${spec.sourceSpec} -> ${bundleFile}\n`,
      );
    }
    if (!dryRun) {
      if (!bundleSourceFn) {
        throw new Error('bundleSource is not available');
      }
      // eslint-disable-next-line no-await-in-loop
      const bundle = await bundleSourceFn(spec.sourceSpec, {
        format: /** @type {import('../src/types.js').ModuleFormat} */ (format),
        conditions,
      });
      // eslint-disable-next-line no-await-in-loop
      await fs.writeFile(
        path.join(outDir, bundleFile),
        `${JSON.stringify(bundle)}\n`,
      );
    }
    manifestEntries.push({
      id,
      bundleFile,
      sourceSpec: spec.sourceSpec,
      bundleName: spec.bundleName,
      registryFile: spec.registryFile,
      registryExport: spec.registryExport,
      key: spec.key,
      packagePath: spec.packagePath,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    agoricSdkRoot,
    outDir,
    format,
    conditions,
    registryFileCount: registryFiles.length,
    entryCount: manifestEntries.length,
    dryRun,
    entries: manifestEntries,
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  if (!dryRun) {
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  process.stdout.write(
    `${dryRun ? 'Discovered' : 'Bundled'} ${manifest.entryCount} source specs from ${manifest.registryFileCount} registries\n`,
  );
  if (!dryRun) {
    process.stdout.write(`Wrote manifest: ${manifestPath}\n`);
  }
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
