// @ts-check
/* global process */
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
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
  const hasGenie = await E(agent).has('setup-genie');
  if (!hasGenie) {
    await E(agent).provideGuest('setup-genie', {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName: 'profile-for-genie',
    });
  }

  await E(agent).makeUnconfined('@main', genieSpecifier, {
    powersName: 'profile-for-genie',
    resultName: 'controller-for-genie',
  });

  const { env } = process;
  const model = env.GENIE_MODEL;
  const workspace = env.GENIE_WORKSPACE;

  if (!model) {
    console.log('No GENIE_MODEL — skipping auto-submit.');
    return;
  }

  const selfLocator = await E(agent).locate('@self');
  const messages = makeRefIterator(E(agent).followMessages());

  console.log('Watching inbox for form from setup-genie...');

  for await (const message of messages) {
    if (message.type !== 'form') continue;
    if (message.from === selfLocator) continue;

    const [fromName] = await E(agent).reverseLocate(message.from);
    if (fromName !== 'setup-genie') continue;

    console.log(`Found form at message ${message.number} — submitting...`);
    await E(agent).submit(message.number, {
      model,
      workspace: workspace || process.cwd(),
    });
    console.log('Submitted.');
  }
};
harden(main);
