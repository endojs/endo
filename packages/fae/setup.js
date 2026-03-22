// @ts-check
// endo run --UNCONFINED setup.js --powers AGENT

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
  const guestName = 'llm-provider-factory-handle';
  const agentName = `profile-for-${guestName}`;

  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
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
