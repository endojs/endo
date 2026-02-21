/* global harden */
// @ts-check
// endo run --UNCONFINED setup-tools.js --powers AGENT
//
// Creates example tool caplets in the host's inventory.
// These can later be sent to a fae agent via mail, or introduced
// during fae provisioning with setup-with-tools.js.

import { E } from '@endo/eventual-send';

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const greetUrl = new URL('tools/greet.js', import.meta.url).href;
  const mathUrl = new URL('tools/math.js', import.meta.url).href;
  const timestampUrl = new URL('tools/timestamp.js', import.meta.url).href;

  await E(agent).makeUnconfined('MAIN', greetUrl, {
    resultName: 'greet-tool',
  });
  console.log('[setup-tools] Created greet-tool');

  await E(agent).makeUnconfined('MAIN', mathUrl, {
    resultName: 'math-tool',
  });
  console.log('[setup-tools] Created math-tool');

  await E(agent).makeUnconfined('MAIN', timestampUrl, {
    resultName: 'timestamp-tool',
  });
  console.log('[setup-tools] Created timestamp-tool');

  console.log('[setup-tools] All tools created in host inventory.');
};
harden(main);
