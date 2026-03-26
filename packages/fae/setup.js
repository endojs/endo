// @ts-check
// endo run --UNCONFINED setup.js --powers @agent

import { E } from '@endo/eventual-send';

const llmProviderFactorySpecifier = new URL(
  'llm-provider-factory.js',
  import.meta.url,
).href;

/**
 * Provision the LLM provider factory guest and launch its caplet.
 *
 * The factory presents a form to HOST for creating provider configs.
 * After a provider is created, use `fae-factory-setup.js` to create
 * a fae-factory bound to that provider.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  if (await E(agent).has('llm-provider-factory')) {
    console.log('Fae LLM provider factory already provisioned — skipping setup.');
    return;
  }

  const guestName = 'llm-provider-factory-handle';
  const agentName = `profile-for-${guestName}`;

  const hasFactory = await E(agent).has(guestName);
  if (!hasFactory) {
    await E(agent).provideGuest(guestName, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName,
    });
  }

  await E(agent).makeUnconfined('@main', llmProviderFactorySpecifier, {
    powersName: agentName,
    resultName: 'llm-provider-factory',
  });
};
harden(main);
