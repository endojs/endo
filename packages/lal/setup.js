/* global process */
// @ts-check
// endo run --UNCONFINED setup.js \
//   --powers AGENT \
//   -E LAL_HOST=$LAL_HOST \
//   -E LAL_MODEL=$LAL_MODEL \
//   -E LAL_AUTH_TOKEN=$LAL_AUTH_TOKEN

import { E } from '@endo/eventual-send';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Read LLM configuration from environment variables and validate it.
 *
 * @returns {{ host: string | undefined, model: string | undefined, authToken: string | undefined }}
 */
const readConfig = () => {
  const host = process.env.LAL_HOST;
  const model = process.env.LAL_MODEL;
  const authToken = process.env.LAL_AUTH_TOKEN;

  // Validate Anthropic API key if using Anthropic
  if (host && host.includes('anthropic.com') && !authToken) {
    throw new Error(
      'LAL_AUTH_TOKEN is required when LAL_HOST points to Anthropic',
    );
  }

  return harden({
    host,
    model,
    authToken,
  });
};
harden(readConfig);

export const main = async agent => {
  const config = readConfig();

  const guest = await E(agent).provideGuest('lal', {
    introducedNames: {},
    agentName: 'profile-for-lal',
  });

  // Persist config into the guest's pet store so the agent can read it
  // on incarnation without needing process.env.
  await E(guest).storeValue(config, 'lal-config');

  await E(agent).makeUnconfined('MAIN', lalSpecifier, {
    powersName: 'profile-for-lal',
    resultName: 'controller-for-lal',
    env: {
      LAL_HOST: config.host,
      LAL_AUTH_TOKEN: config.authToken,
      LAL_MODEL: config.model,
    },
  });
};
harden(main);
