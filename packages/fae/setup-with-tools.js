/* global process, harden */
// @ts-check
// endo run --UNCONFINED setup-with-tools.js \
//   --powers AGENT \
//   -E LAL_HOST=$LAL_HOST \
//   -E LAL_MODEL=$LAL_MODEL \
//   -E LAL_AUTH_TOKEN=$LAL_AUTH_TOKEN
//
// Creates tools in the host inventory, then provisions a fae agent
// with those tools pre-introduced via introducedNames.

import { E } from '@endo/eventual-send';

const faeSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * @returns {{ host: string | undefined, model: string | undefined, authToken: string | undefined }}
 */
const readConfig = () => {
  const host = process.env.LAL_HOST;
  const model = process.env.LAL_MODEL;
  const authToken = process.env.LAL_AUTH_TOKEN;

  if (host && host.includes('anthropic.com') && !authToken) {
    throw new Error(
      'LAL_AUTH_TOKEN is required when LAL_HOST points to Anthropic',
    );
  }

  return harden({ host, model, authToken });
};
harden(readConfig);

/**
 * Provision tools and a fae agent with those tools pre-introduced.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const config = readConfig();

  // Create tools in host inventory
  const greetUrl = new URL('tools/greet.js', import.meta.url).href;
  const mathUrl = new URL('tools/math.js', import.meta.url).href;
  const timestampUrl = new URL('tools/timestamp.js', import.meta.url).href;

  await E(agent).makeUnconfined('MAIN', greetUrl, {
    resultName: 'greet-tool',
  });
  console.log('[setup] Created greet-tool');

  await E(agent).makeUnconfined('MAIN', mathUrl, {
    resultName: 'math-tool',
  });
  console.log('[setup] Created math-tool');

  await E(agent).makeUnconfined('MAIN', timestampUrl, {
    resultName: 'timestamp-tool',
  });
  console.log('[setup] Created timestamp-tool');

  // Provision fae guest with tools introduced at top level.
  // Fae's initializeIntroducedTools() will move them into tools/.
  await E(agent).provideGuest('fae', {
    agentName: 'profile-for-fae',
    introducedNames: {
      'greet-tool': 'greet-tool',
      'math-tool': 'math-tool',
      'timestamp-tool': 'timestamp-tool',
    },
  });
  console.log('[setup] Created fae guest with introduced tools');

  await E(agent).makeUnconfined('MAIN', faeSpecifier, {
    powersName: 'profile-for-fae',
    resultName: 'controller-for-fae',
    env: {
      LAL_HOST: config.host,
      LAL_AUTH_TOKEN: config.authToken,
      LAL_MODEL: config.model,
    },
  });
  console.log('[setup] Fae agent started');
};
harden(main);
