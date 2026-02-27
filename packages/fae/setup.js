/* global process */
// @ts-check
// endo run --UNCONFINED setup.js \
//   --powers AGENT \
//   -E LAL_HOST=$LAL_HOST \
//   -E LAL_MODEL=$LAL_MODEL \
//   -E LAL_AUTH_TOKEN=$LAL_AUTH_TOKEN

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
 * Provision a fae agent as a guest caplet (no tools pre-installed).
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const config = readConfig();

  await E(agent).provideGuest('fae', {
    introducedNames: {},
    agentName: 'profile-for-fae',
  });

  await E(agent).makeUnconfined('MAIN', faeSpecifier, {
    powersName: 'profile-for-fae',
    resultName: 'controller-for-fae',
    env: {
      LAL_HOST: config.host,
      LAL_AUTH_TOKEN: config.authToken,
      LAL_MODEL: config.model,
    },
  });
};
harden(main);
