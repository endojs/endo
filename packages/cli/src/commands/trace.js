/* eslint-disable @endo/restrict-comparison-operands */
import os from 'os';

import { E } from '@endo/eventual-send';

import { withEndoHost } from '../context.js';

/** @import { EndoTraceReport } from '@endo/daemon' */

/**
 * @param {EndoTraceReport} report
 * @param {string} [indent]
 */
const formatReport = (report, indent = '') => {
  /** @type {string[]} */
  const lines = [];
  const partial = report.partial ? ' (partial)' : '';
  lines.push(`${indent}${report.errorId}${partial}`);
  lines.push(`${indent}  worker: ${report.workerId || '(unknown)'}`);
  lines.push(`${indent}  site:   ${report.site}`);
  if (report.t) {
    lines.push(`${indent}  when:   ${new Date(report.t).toISOString()}`);
  }
  lines.push(`${indent}  ${report.name}: ${report.message}`);
  if (report.stack) {
    for (const line of report.stack.split('\n')) {
      if (line.length > 0) lines.push(`${indent}    ${line}`);
    }
  }
  if (report.annotations && report.annotations.length > 0) {
    lines.push(`${indent}  annotations:`);
    for (const ann of report.annotations) {
      lines.push(`${indent}    - ${ann}`);
    }
  }
  if (report.causes && report.causes.length > 0) {
    lines.push(`${indent}  caused by:`);
    for (const cause of report.causes) {
      lines.push(formatReport(cause, `${indent}    `));
    }
  }
  if (report.related && report.related.length > 0) {
    lines.push(`${indent}  related:`);
    for (const related of report.related) {
      const relPartial = related.partial ? ' (partial)' : '';
      lines.push(
        `${indent}    - ${related.errorId}${relPartial} ${related.name}: ${related.message}`,
      );
    }
  }
  return lines.join('\n');
};

/**
 * @param {object} args
 * @param {string} [args.errorId]
 * @param {boolean} [args.recent]
 * @param {string} [args.workerId]
 * @param {number} [args.limit]
 * @param {boolean} [args.json]
 * @param {boolean} [args.statsOnly]
 */
export const trace = async ({
  errorId,
  recent,
  workerId,
  limit,
  json,
  statsOnly,
}) =>
  withEndoHost({ os, process }, async ({ host }) => {
    const traces = await E(E(host).diagnostics()).traces();
    if (statsOnly) {
      const stats = await E(traces).stats();
      if (json) {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log(`workers:       ${stats.workers}`);
        console.log(`totalRecords:  ${stats.totalRecords}`);
        console.log(`bytes:         ${stats.bytes}`);
        console.log(`aliases:       ${stats.aliases}`);
      }
      return;
    }
    if (recent) {
      const opts = {};
      if (workerId !== undefined) opts.workerId = workerId;
      if (limit !== undefined) opts.limit = limit;
      const list = await E(traces).recent(opts);
      if (json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      if (list.length === 0) {
        console.log('(no recent error traces)');
        return;
      }
      for (const report of list) {
        console.log(formatReport(report));
        console.log('');
      }
      return;
    }
    if (errorId === undefined) {
      console.error(
        'Usage: endo trace <errorId> | endo trace --recent [--worker <id>] [--limit N] | endo trace --stats',
      );
      process.exitCode = 1;
      return;
    }
    const report = await E(traces).lookup(errorId);
    if (report === undefined) {
      console.error(`No trace recorded for ${errorId}`);
      process.exitCode = 1;
      return;
    }
    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(formatReport(report));
    console.log(`(end trace errorId=${report.errorId})`);
  });
