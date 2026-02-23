#!/usr/bin/env node
// @ts-check
/* global process */

import fs from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';

const options = /** @type {const} */ ({
  'out-trace': { type: 'string' },
  'out-summary': { type: 'string' },
  'out-markdown': { type: 'string' },
  top: { type: 'string' },
  stacked: { type: 'boolean' },
});

const usage = `\
Usage:
  node tools/trace-merge.js [--out-trace merged.trace.json] [--out-summary summary.json] [--out-markdown summary.md] [--top 30] [--stacked] <trace-file-or-dir>...

Examples:
  node tools/trace-merge.js /tmp/bs-profiles
  node tools/trace-merge.js --out-markdown /tmp/summary.md /tmp/bs-profiles /tmp/other.trace.json
`;

const FOCUS_SPANS = [
  'evasiveTransform.fastPath.scan',
  'evasiveTransform.fastPath.hit',
  'evasiveTransform.fastPath.miss',
  'bundleSource.readCache.hit',
  'bundleSource.readCache.miss',
  'bundleSource.readCache.pending',
];

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {string} spanName
 * @param {string} argName
 * @returns {number}
 */
const sumNumericArgBySpan = (events, spanName, argName) => {
  let total = 0;
  for (const event of events) {
    if (event.ph !== 'X' || event.name !== spanName) {
      continue;
    }
    const args = /** @type {Record<string, unknown> | undefined} */ (event.args);
    const value = args && args[argName];
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
    }
  }
  return total;
};

/**
 * @param {string} value
 * @returns {number}
 */
const toInt = value => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected positive integer, got: ${value}`);
  }
  return n;
};

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
const findTraceFiles = async root => {
  const stat = await fs.stat(root);
  if (stat.isFile()) {
    return root.endsWith('.trace.json') ? [root] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }
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
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(filePath);
      } else if (entry.isFile() && entry.name.endsWith('.trace.json')) {
        found.push(filePath);
      }
    }
  }
  return found;
};

/**
 * @param {number[]} sorted
 * @param {number} p
 * @returns {number}
 */
const percentile = (sorted, p) => {
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

/**
 * @param {number} micros
 * @returns {string}
 */
const microsToMsText = micros => (micros / 1000).toFixed(3);

/**
 * @param {Array<[number, number]>} intervals
 * @returns {number}
 */
const unionDuration = intervals => {
  if (intervals.length === 0) {
    return 0;
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i += 1) {
    const [start, end] = intervals[i];
    if (start <= curEnd) {
      if (end > curEnd) {
        curEnd = end;
      }
    } else {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    }
  }
  total += curEnd - curStart;
  return total;
};

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {number} top
 */
const summarize = (events, top) => {
  /** @type {Map<string, number[]>} */
  const durationsByName = new Map();
  /** @type {Map<string, Array<[number, number]>>} */
  const intervalsByName = new Map();
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.name !== 'string') {
      continue;
    }
    const dur = typeof event.dur === 'number' ? event.dur : undefined;
    const ts = typeof event.ts === 'number' ? event.ts : undefined;
    if (dur === undefined || ts === undefined) {
      continue;
    }
    const bucket = durationsByName.get(event.name);
    if (bucket) {
      bucket.push(dur);
    } else {
      durationsByName.set(event.name, [dur]);
    }
    const intervals = intervalsByName.get(event.name);
    const interval = /** @type {[number, number]} */ ([ts, ts + dur]);
    if (intervals) {
      intervals.push(interval);
    } else {
      intervalsByName.set(event.name, [interval]);
    }
  }

  const rows = [...durationsByName.entries()].map(([name, durations]) => {
    durations.sort((a, b) => a - b);
    const total = durations.reduce((sum, value) => sum + value, 0);
    const criticalPathUs = unionDuration([...(intervalsByName.get(name) || [])]);
    return {
      name,
      count: durations.length,
      totalUs: total,
      criticalPathUs,
      overlapFactor: criticalPathUs > 0 ? total / criticalPathUs : 0,
      avgUs: total / durations.length,
      minUs: durations[0],
      maxUs: durations[durations.length - 1],
      p50Us: percentile(durations, 50),
      p95Us: percentile(durations, 95),
    };
  });
  rows.sort((a, b) => b.totalUs - a.totalUs);
  return rows.slice(0, top);
};

/**
 * @param {ReturnType<typeof summarize>} rows
 * @returns {Map<string, ReturnType<typeof summarize>[number]>}
 */
const rowsByName = rows => new Map(rows.map(row => [row.name, row]));

/**
 * @param {string} name
 */
const zeroRow = name => ({
  name,
  count: 0,
  totalUs: 0,
  criticalPathUs: 0,
  overlapFactor: 0,
  avgUs: 0,
  minUs: 0,
  maxUs: 0,
  p50Us: 0,
  p95Us: 0,
});

/**
 * @param {ReturnType<typeof summarize>} rows
 * @returns {string}
 */
const summarizeMarkdown = (rows, focusRows = []) => {
  const header = [
    '| Span | Count | Total ms | Critical ms | Overlap x | Avg ms | P50 ms | P95 ms | Max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const body = rows.map(row =>
    [
      `| ${row.name}`,
      `${row.count}`,
      `${microsToMsText(row.totalUs)}`,
      `${microsToMsText(row.criticalPathUs)}`,
      `${row.overlapFactor.toFixed(2)}`,
      `${microsToMsText(row.avgUs)}`,
      `${microsToMsText(row.p50Us)}`,
      `${microsToMsText(row.p95Us)}`,
      `${microsToMsText(row.maxUs)} |`,
    ].join(' | '),
  );
  const main = `${header.join('\n')}\n${body.join('\n')}\n`;
  if (focusRows.length === 0) {
    return main;
  }
  const focusBody = focusRows.map(row =>
    [
      `| ${row.name}`,
      `${row.count}`,
      `${microsToMsText(row.totalUs)}`,
      `${microsToMsText(row.criticalPathUs)}`,
      `${row.overlapFactor.toFixed(2)}`,
      `${microsToMsText(row.avgUs)}`,
      `${microsToMsText(row.p50Us)}`,
      `${microsToMsText(row.p95Us)}`,
      `${microsToMsText(row.maxUs)} |`,
    ].join(' | '),
  );
  return `${main}\nFocus spans:\n\n${header.join('\n')}\n${focusBody.join('\n')}\n`;
};

/**
 * @param {ReturnType<typeof summarize>} allRows
 * @param {ReturnType<typeof summarize>} focusSpans
 * @param {Array<Record<string, unknown>>} events
 */
const makeDerivedMetrics = (allRows, focusSpans, events) => {
  const allByName = rowsByName(allRows);
  const focusByName = rowsByName(focusSpans);
  const bundlesProcessed = allByName.get('bundleSource.total')?.count || 0;
  const modulesParsed =
    allByName.get('compartmentMapper.importHook.parseModule')?.count || 0;
  const modulesTransformed = allByName.get('bundleSource.transformModule')?.count || 0;
  const fastPathHitCount =
    focusByName.get('evasiveTransform.fastPath.hit')?.count || 0;
  const fastPathMissCount =
    focusByName.get('evasiveTransform.fastPath.miss')?.count || 0;
  const fastPathTotal = fastPathHitCount + fastPathMissCount;
  const fastPathHitRate = fastPathTotal > 0 ? fastPathHitCount / fastPathTotal : 0;
  const readCacheHitCount = focusByName.get('bundleSource.readCache.hit')?.count || 0;
  const readCacheMissCount =
    focusByName.get('bundleSource.readCache.miss')?.count || 0;
  const readCachePendingCount =
    focusByName.get('bundleSource.readCache.pending')?.count || 0;
  const readCacheLookups = readCacheHitCount + readCacheMissCount;
  const readCacheHitRate =
    readCacheLookups > 0 ? readCacheHitCount / readCacheLookups : 0;

  const bytesRead = sumNumericArgBySpan(
    events,
    'compartmentMapper.importHook.readModuleBytes',
    'bytes',
  );
  const bytesTransformed = sumNumericArgBySpan(
    events,
    'bundleSource.transformModule',
    'outputBytes',
  );
  const bytesArchived = sumNumericArgBySpan(
    events,
    'compartmentMapper.archiveLite.writeZip.snapshot',
    'bytes',
  );

  const totalBundleMs = (allByName.get('bundleSource.total')?.totalUs || 0) / 1000;
  const totalParseMs =
    (allByName.get('compartmentMapper.importHook.parseModule')?.totalUs || 0) /
    1000;
  const totalTransformMs =
    (allByName.get('bundleSource.transformModule')?.totalUs || 0) / 1000;
  const totalReadUs =
    allByName.get('compartmentMapper.importHook.readModuleBytes')?.totalUs || 0;
  const readKB = bytesRead / 1024;

  return {
    bundlesProcessed,
    modulesParsed,
    modulesTransformed,
    fastPathHitCount,
    fastPathMissCount,
    fastPathHitRate,
    readCacheHitCount,
    readCacheMissCount,
    readCachePendingCount,
    readCacheHitRate,
    bytesRead,
    bytesTransformed,
    bytesArchived,
    msPerBundle: bundlesProcessed > 0 ? totalBundleMs / bundlesProcessed : 0,
    msPerModuleParsed: modulesParsed > 0 ? totalParseMs / modulesParsed : 0,
    msPerModuleTransformed:
      modulesTransformed > 0 ? totalTransformMs / modulesTransformed : 0,
    usPerKBRead: readKB > 0 ? totalReadUs / readKB : 0,
  };
};

const main = async () => {
  const {
    values: {
      'out-trace': outTrace = 'merged.trace.json',
      'out-summary': outSummary = 'summary.json',
      'out-markdown': outMarkdown = 'summary.md',
      top: topRaw = '30',
      stacked = true,
    },
    positionals,
  } = parseArgs({ options, allowPositionals: true });

  if (positionals.length === 0) {
    throw new Error(usage);
  }
  const top = toInt(topRaw);

  /** @type {string[]} */
  const traceFiles = [];
  for (const input of positionals) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await exists(input))) {
      throw new Error(`Input does not exist: ${input}`);
    }
    // eslint-disable-next-line no-await-in-loop
    const files = await findTraceFiles(input);
    traceFiles.push(...files);
  }

  if (traceFiles.length === 0) {
    throw new Error(`No *.trace.json files found in inputs.\n\n${usage}`);
  }

  /** @type {Array<Record<string, unknown>>} */
  const mergedEvents = [];
  let offsetUs = 0;
  for (const filePath of traceFiles.sort()) {
    // eslint-disable-next-line no-await-in-loop
    const text = await fs.readFile(filePath, 'utf-8');
    /** @type {{traceEvents?: Array<Record<string, unknown>>}} */
    const trace = JSON.parse(text);
    const events = trace.traceEvents || [];
    let maxEndUs = 0;
    for (const event of events) {
      const copy = { ...event, args: { ...(event.args || {}), source: filePath } };
      if (stacked) {
        if (typeof copy.ts === 'number') {
          copy.ts += offsetUs;
        }
      }
      const ts = typeof copy.ts === 'number' ? copy.ts : 0;
      const dur = typeof copy.dur === 'number' ? copy.dur : 0;
      maxEndUs = Math.max(maxEndUs, ts + dur);
      mergedEvents.push(copy);
    }
    if (stacked) {
      offsetUs = maxEndUs + 1000;
    }
  }

  const allRows = summarize(mergedEvents, Number.MAX_SAFE_INTEGER);
  const summaryTop = allRows.slice(0, top);
  const focusLookup = rowsByName(allRows);
  const focusSpans = FOCUS_SPANS.map(
    name => focusLookup.get(name) || zeroRow(name),
  );
  const derivedMetrics = makeDerivedMetrics(allRows, focusSpans, mergedEvents);
  const summary = {
    generatedAt: new Date().toISOString(),
    traceFileCount: traceFiles.length,
    eventCount: mergedEvents.length,
    topSpansByTotalDuration: summaryTop,
    focusSpans,
    derivedMetrics,
    traceFiles,
  };

  await fs.writeFile(
    outTrace,
    JSON.stringify({ traceEvents: mergedEvents, displayTimeUnit: 'ms' }, null, 2),
  );
  await fs.writeFile(outSummary, JSON.stringify(summary, null, 2));
  await fs.writeFile(outMarkdown, summarizeMarkdown(summaryTop, focusSpans));

  process.stdout.write(`Merged ${traceFiles.length} trace files\n`);
  process.stdout.write(`Wrote merged trace: ${outTrace}\n`);
  process.stdout.write(`Wrote summary JSON: ${outSummary}\n`);
  process.stdout.write(`Wrote summary Markdown: ${outMarkdown}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
