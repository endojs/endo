import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';
import { renderPath, renderBanner } from '../render-retention-path.js';

/** @import { RetentionPath } from '@endo/daemon' */

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
    const retentionPaths = /** @type {RetentionPath[]} */ (
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
      console.log(renderBanner(rPath, i));
      for (const line of renderPath(rPath)) {
        console.log(line);
      }
      if (i < retentionPaths.length - 1) {
        console.log('');
      }
    }
  });
