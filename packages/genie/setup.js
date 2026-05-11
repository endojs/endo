// @ts-check
/* global process */
/* eslint-disable no-continue */
// endo run --UNCONFINED setup.js --powers @agent
//   -E GENIE_MODEL=ollama/llama3.2
//   -E GENIE_WORKSPACE=/path/to/workspace

/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const genieSpecifier = new URL('main.js', import.meta.url).href;

/**
 * Provision a genie guest, launch the main caplet, then watch the
 * inbox for configuration forms from the genie guest and auto-submit
 * env vars.  Runs until interrupted.
 *
 * @param {EndoHost} hostAgent
 */
export const main = async hostAgent => {
  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
  const hasGenie = await E(hostAgent).has('setup-genie');
  if (!hasGenie) {
    await E(hostAgent).provideGuest('setup-genie', {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName: 'profile-for-genie',
    });
  }

  await E(hostAgent).makeUnconfined('@main', genieSpecifier, {
    powersName: 'profile-for-genie',
    resultName: 'controller-for-genie',
  });

  const { env } = process;
  const model = env.GENIE_MODEL;
  const workspace = env.GENIE_WORKSPACE;
  const name = env.GENIE_NAME || 'main-genie';

  if (!model) {
    console.log('No GENIE_MODEL — skipping auto-submit.');
    return;
  }

  const selfLocator = await E(hostAgent).locate('@self');
  const messages = makeRefIterator(E(hostAgent).followMessages());

  console.log('Watching inbox for form from setup-genie...');

  for await (const message of messages) {
    if (message.type !== 'form') continue;
    if (message.from === selfLocator) continue;

    const [fromName] = await E(hostAgent).reverseLocate(message.from);
    if (fromName !== 'setup-genie') continue;

    console.log(`Found form at message ${message.number} — submitting...`);
    await E(hostAgent).submit(message.number, {
      name,
      model,
      workspace: workspace || process.cwd(),
    });
    console.log('Submitted.');
    return;
  }
};
harden(main);
