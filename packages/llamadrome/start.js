// endo run --UNCONFINED setup.js --powers AGENT

import { E } from '@endo/eventual-send';

const llalSpecifier = new URL('agent.js', import.meta.url).href;

export const main = async agent => {
  await E(agent).provideGuest('lal', {
    introducedNames: {},
    agentName: 'profile-for-lal',
  });
  await E(agent).makeUnconfined(
    'MAIN',
    llalSpecifier,
    'profile-for-lal',
    'supervisor-for-lal',
  );
};
