/* global process */
// endo run --UNCONFINED start.js \
//   --powers AGENT \
//   -E LAL_HOST=$LAL_HOST \
//   -E LAL_MODEL=$LAL_MODEL \
//   -E LAL_AUTH_TOKEN=$LAL_AUTH_TOKEN

import { E } from '@endo/eventual-send';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

const { LAL_HOST, LAL_AUTH_TOKEN, LAL_MODEL } = process.env;

export const main = async agent => {
  await E(agent).provideGuest('lal', {
    introducedNames: {},
    agentName: 'profile-for-lal',
  });
  await E(agent).makeUnconfined('MAIN', lalSpecifier, {
    powersName: 'profile-for-lal',
    resultName: 'controller-for-lal',
    env: {
      LAL_HOST,
      LAL_AUTH_TOKEN,
      LAL_MODEL,
    },
  });
};
