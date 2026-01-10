// endo run --UNCONFINED setup.js --powers AGENT

import { E } from '@endo/eventual-send';

const llamadromeSpecifier = new URL('llm-agent.js', import.meta.url).href;

export const main = async agent => {
  await E(agent).provideGuest('llamadrome', {
    introducedNames: {},
    agentName: 'powers-for-llamadrome',
  });
  await E(agent).makeUnconfined(
    'MAIN',
    llamadromeSpecifier,
    'powers-for-llamadrome',
    ['PINS', 'llamadrome-server'],
  );
};
