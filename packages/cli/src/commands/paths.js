/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Render a single retention path in the human-readable form
 * documented in `designs/daemon-retention-paths.md` § CLI: endo
 * paths.
 *
 * @param {import('@endo/daemon').RetentionPath} path
 * @returns {string[]}
 */
const renderPath = path => {
  /** @type {string[]} */
  const lines = [];
  // Walk leaf-to-root so the topmost segment renders last (matches
  // the design's example, which reads "rooted at endo" first).
  const segments = [...path].reverse();
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const isRoot = seg.type === 'root';
    const members = (seg.groupMembers ?? []).join(', ');
    const label =
      isRoot && i === 0
        ? `(root) ${members}`
        : i === segments.length - 1
          ? `(target) ${members}`
          : members;
    lines.push(`  ${label}`);
    // Edge labels separating this segment from the next one
    // downstream (i.e. closer to the target).
    if (i < segments.length - 1) {
      const next = segments[i + 1];
      const labels = next.labels ?? [];
      if (labels.length === 0) {
        lines.push(`    ->`);
      } else {
        for (const lab of labels) {
          if (lab.startsWith('pet:')) {
            lines.push(`    "${lab.slice('pet:'.length)}"`);
          } else {
            lines.push(`    ->${lab}`);
          }
        }
      }
    }
  }
  return lines;
};

/**
 * @param {object} args
 * @param {string} args.name
 * @param {string[] | undefined} args.agentNames
 * @param {boolean} args.locator
 * @param {boolean} args.json
 */
export const paths = async ({ name, agentNames, locator, json }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent, host }) => {
    let resolvedLocator;
    if (locator) {
      resolvedLocator = name;
    } else {
      const namePath = parsePetNamePath(name);
      resolvedLocator = await E(agent).locate(...namePath);
      if (resolvedLocator === undefined) {
        console.error(`${name}: not found`);
        process.exitCode = 1;
        return;
      }
    }
    const retentionPaths =
      /** @type {import('@endo/daemon').RetentionPath[]} */ (
        await E(host).listRetentionPaths(resolvedLocator)
      );
    if (json) {
      console.log(JSON.stringify(retentionPaths, null, 2));
      return;
    }
    if (retentionPaths.length === 0) {
      console.log(`No retention paths for ${resolvedLocator}.`);
      console.log(
        '(The target is unreachable from any GC root, or the locator',
      );
      console.log(' does not name a known formula.)');
      return;
    }
    for (let i = 0; i < retentionPaths.length; i += 1) {
      const rPath = retentionPaths[i];
      // The root segment is the last element of the array per
      // graph.js's listRetentionPaths contract.
      const rootSeg = rPath[rPath.length - 1];
      const isRooted = rootSeg && rootSeg.type === 'root';
      const banner = isRooted
        ? `Path ${i + 1} (rooted at GC root):`
        : `Path ${i + 1}:`;
      console.log(banner);
      for (const line of renderPath(rPath)) {
        console.log(line);
      }
      if (i < retentionPaths.length - 1) {
        console.log('');
      }
    }
  });
