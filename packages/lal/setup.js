/* global process */
// @ts-check
// endo run --UNCONFINED setup.js \
//   --powers AGENT \
//   [-E LAL_HOST=$LAL_HOST] \
//   [-E LAL_MODEL=$LAL_MODEL] \
//   [-E LAL_AUTH_TOKEN=$LAL_AUTH_TOKEN]

import { E } from '@endo/eventual-send';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Read LLM configuration from environment variables.
 * Returns whatever is available — all fields may be undefined.
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
  const hasEnvConfig = config.host !== undefined;

  await E(agent).provideGuest('lal', {
    introducedNames: { AGENT: 'AGENT' },
    agentName: 'profile-for-lal',
  });

  await E(agent).makeUnconfined('MAIN', lalSpecifier, {
    powersName: 'profile-for-lal',
    resultName: 'controller-for-lal',
    ...(hasEnvConfig
      ? {
          env: {
            LAL_HOST: config.host,
            LAL_MODEL: config.model,
            LAL_AUTH_TOKEN: config.authToken,
          },
        }
      : {}),
  });
};
harden(main);
