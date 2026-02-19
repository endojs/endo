#!/usr/bin/env node --experimental-strip-types
/* global process */
import '@endo/init';

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseArgs } from 'util';

import bundleSource from '../src/index.js';

const options = {
  'agoric-sdk-root': { type: 'string' },
  'out-dir': { type: 'string' },
  format: { type: 'string' },
  condition: { type: 'string', multiple: true },
  top: { type: 'string' },
  verbose: { type: 'boolean' },
} as const;

const usage = `\
Usage:
  node --experimental-strip-types tools/profile-agoric-bundling.mts [--agoric-sdk-root <path>] [--out-dir <path>] [--format <moduleFormat>] [--condition <name>]... [--top 30] [--verbose]

Defaults:
  --agoric-sdk-root /opt/agoric/agoric-sdk
  --out-dir /tmp/profile-agoric-bundling-<timestamp>
  --format endoZipBase64
  --top 30
`;

const toInt = (value: string): number => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected positive integer, got: ${value}`);
  }
  return n;
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const findSourceSpecRegistryFiles = async (root: string): Promise<string[]> => {
  const found: string[] = [];
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

const toRecord = (value: unknown): Record<string, any> | undefined => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return value as Record<string, any>;
  }
  return undefined;
};

type SourceSpec = {
  registryFile: string;
  registryExport: string;
  key: string;
  bundleName: string;
  sourceSpec: string;
  packagePath?: string;
};

const collectSpecsFromModule = (
  filePath: string,
  moduleNs: Record<string, unknown>,
): SourceSpec[] => {
  const collected: SourceSpec[] = [];
  for (const [exportName, exportValue] of Object.entries(moduleNs)) {
    const maybeRegistry = toRecord(exportValue);
    if (!maybeRegistry) {
      continue;
    }
    for (const [key, descriptorMaybe] of Object.entries(maybeRegistry)) {
      const descriptor = toRecord(descriptorMaybe);
      if (!descriptor || typeof descriptor.sourceSpec !== 'string') {
        continue;
      }
      collected.push({
        registryFile: filePath,
        registryExport: exportName,
        key,
        bundleName:
          typeof descriptor.bundleName === 'string' ? descriptor.bundleName : key,
        sourceSpec: descriptor.sourceSpec,
        packagePath:
          typeof descriptor.packagePath === 'string'
            ? descriptor.packagePath
            : undefined,
      });
    }
  }
  return collected;
};

const sanitizeName = (text: string): string =>
  text.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');

const findTraceFiles = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.shift();
    if (!dir) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(filePath);
      } else if (entry.isFile() && entry.name.endsWith('.trace.json')) {
        found.push(filePath);
      }
    }
  }
  return found.sort();
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0];
  }
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sorted[lo];
  }
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
};

const microsToMsText = (micros: number): string => (micros / 1000).toFixed(3);

type SummaryRow = {
  name: string;
  count: number;
  totalUs: number;
  avgUs: number;
  maxUs: number;
  p50Us: number;
  p95Us: number;
};

const summarizeEvents = (
  events: Array<Record<string, unknown>>,
  top: number,
): SummaryRow[] => {
  const durationsByName = new Map<string, number[]>();
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.name !== 'string') {
      continue;
    }
    const dur = typeof event.dur === 'number' ? event.dur : undefined;
    if (dur === undefined) {
      continue;
    }
    const bucket = durationsByName.get(event.name);
    if (bucket) {
      bucket.push(dur);
    } else {
      durationsByName.set(event.name, [dur]);
    }
  }

  const rows: SummaryRow[] = [...durationsByName.entries()].map(
    ([name, durations]) => {
      durations.sort((a, b) => a - b);
      const total = durations.reduce((sum, value) => sum + value, 0);
      return {
        name,
        count: durations.length,
        totalUs: total,
        avgUs: total / durations.length,
        maxUs: durations[durations.length - 1],
        p50Us: percentile(durations, 50),
        p95Us: percentile(durations, 95),
      };
    },
  );
  rows.sort((a, b) => b.totalUs - a.totalUs);
  return rows.slice(0, top);
};

const summarizeMarkdown = (rows: SummaryRow[]): string => {
  const header = [
    '| Span | Count | Total ms | Avg ms | P50 ms | P95 ms | Max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const body = rows.map(row =>
    [
      `| ${row.name}`,
      `${row.count}`,
      `${microsToMsText(row.totalUs)}`,
      `${microsToMsText(row.avgUs)}`,
      `${microsToMsText(row.p50Us)}`,
      `${microsToMsText(row.p95Us)}`,
      `${microsToMsText(row.maxUs)} |`,
    ].join(' | '),
  );
  return `${header.join('\n')}\n${body.join('\n')}\n`;
};

const mergeTraceFiles = async (
  traceFiles: string[],
): Promise<Array<Record<string, unknown>>> => {
  const mergedEvents: Array<Record<string, unknown>> = [];
  let offsetUs = 0;
  for (const filePath of traceFiles) {
    // eslint-disable-next-line no-await-in-loop
    const text = await fs.readFile(filePath, 'utf-8');
    const trace = JSON.parse(text) as { traceEvents?: Array<Record<string, unknown>> };
    const events = trace.traceEvents || [];
    let maxEndUs = 0;
    for (const event of events) {
      const copy = {
        ...event,
        args: { ...(event.args || {}), source: filePath },
      };
      if (typeof copy.ts === 'number') {
        copy.ts += offsetUs;
      }
      const ts = typeof copy.ts === 'number' ? copy.ts : 0;
      const dur = typeof copy.dur === 'number' ? copy.dur : 0;
      maxEndUs = Math.max(maxEndUs, ts + dur);
      mergedEvents.push(copy);
    }
    offsetUs = maxEndUs + 1000;
  }
  return mergedEvents;
};

const main = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOutDir = path.join(
    os.tmpdir(),
    `profile-agoric-bundling-${timestamp}`,
  );
  const {
    values: {
      'agoric-sdk-root': agoricSdkRoot = '/opt/agoric/agoric-sdk',
      'out-dir': outDir = defaultOutDir,
      format = 'endoZipBase64',
      condition: conditions = [],
      top: topRaw = '30',
      verbose = false,
    },
    positionals,
  } = parseArgs({ options, allowPositionals: true });
  if (positionals.length > 0) {
    throw new Error(`Unexpected arguments: ${positionals.join(' ')}\n\n${usage}`);
  }
  const top = toInt(topRaw);

  if (!(await exists(agoricSdkRoot))) {
    throw new Error(`agoric-sdk root does not exist: ${agoricSdkRoot}`);
  }

  const bundlesDir = path.join(outDir, 'bundles');
  const tracesDir = path.join(outDir, 'traces');
  await fs.mkdir(bundlesDir, { recursive: true });
  await fs.mkdir(tracesDir, { recursive: true });

  const registryFiles = await findSourceSpecRegistryFiles(agoricSdkRoot);
  if (registryFiles.length === 0) {
    throw new Error(
      `No source-spec-registry.js files found under: ${agoricSdkRoot}`,
    );
  }

  const allSpecs: SourceSpec[] = [];
  for (const registryFile of registryFiles) {
    // eslint-disable-next-line no-await-in-loop
    const moduleNs = (await import(pathToFileURL(registryFile).href)) as Record<
      string,
      unknown
    >;
    allSpecs.push(...collectSpecsFromModule(registryFile, moduleNs));
  }
  if (allSpecs.length === 0) {
    throw new Error(`No bundle source specs discovered.\n\n${usage}`);
  }

  const deduped = new Map<string, SourceSpec>();
  for (const spec of allSpecs) {
    const dedupeKey = `${spec.sourceSpec}::${spec.bundleName}`;
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, spec);
    }
  }
  const specs = [...deduped.values()];

  const manifestEntries: Array<{
    id: string;
    bundleFile: string;
    sourceSpec: string;
    bundleName: string;
    registryFile: string;
    registryExport: string;
    key: string;
    packagePath?: string;
  }> = [];

  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const registryPackage = path.basename(path.dirname(spec.registryFile));
    const id = sanitizeName(`${registryPackage}-${spec.bundleName}-${spec.key}`);
    const bundleFile = `${id}.bundle.json`;
    if (verbose) {
      process.stdout.write(
        `[${index + 1}/${specs.length}] ${spec.sourceSpec} -> ${bundleFile}\n`,
      );
    }

    // eslint-disable-next-line no-await-in-loop
    const bundle = await bundleSource(spec.sourceSpec, {
      format: format as import('../src/types.js').ModuleFormat,
      conditions,
      profile: {
        enabled: true,
        traceDir: tracesDir,
      },
    });
    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(path.join(bundlesDir, bundleFile), `${JSON.stringify(bundle)}\n`);

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

  const traceFiles = await findTraceFiles(tracesDir);
  const mergedEvents = await mergeTraceFiles(traceFiles);
  const topRows = summarizeEvents(mergedEvents, top);

  const manifest = {
    generatedAt: new Date().toISOString(),
    agoricSdkRoot,
    outDir,
    bundlesDir,
    tracesDir,
    format,
    conditions,
    registryFileCount: registryFiles.length,
    entryCount: manifestEntries.length,
    traceFileCount: traceFiles.length,
    entries: manifestEntries,
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    traceFileCount: traceFiles.length,
    eventCount: mergedEvents.length,
    topSpansByTotalDuration: topRows,
    traceFiles,
  };

  const mergedTracePath = path.join(outDir, 'merged.trace.json');
  const summaryPath = path.join(outDir, 'summary.json');
  const summaryMdPath = path.join(outDir, 'summary.md');
  const manifestPath = path.join(outDir, 'manifest.json');

  await fs.writeFile(
    mergedTracePath,
    JSON.stringify({ traceEvents: mergedEvents, displayTimeUnit: 'ms' }, null, 2),
  );
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  await fs.writeFile(summaryMdPath, summarizeMarkdown(topRows));
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(
    `Bundled ${manifest.entryCount} source specs from ${manifest.registryFileCount} registries\n`,
  );
  process.stdout.write(`Output directory: ${outDir}\n`);
  process.stdout.write(`Manifest: ${manifestPath}\n`);
  process.stdout.write(`Merged trace: ${mergedTracePath}\n`);
  process.stdout.write(`Summary JSON: ${summaryPath}\n`);
  process.stdout.write(`Summary Markdown: ${summaryMdPath}\n\n`);
  process.stdout.write('Top spans by total duration:\n');
  process.stdout.write(summarizeMarkdown(topRows));
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
