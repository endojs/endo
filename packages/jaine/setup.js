// @ts-check
// endo run --UNCONFINED setup.js --powers @agent
//
// Provisions the LLM provider factory if not already present.
// Jaine reuses fae's llm-provider-factory — no need to create a new one.
// If the factory is already set up (from fae), this is a no-op.

import { E } from '@endo/eventual-send';

const llmProviderFactorySpecifier = new URL(
  '../fae/llm-provider-factory.js',
  import.meta.url,
).href;

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  // Check if the factory already exists (e.g. from fae setup)
  const hasResult = await E(agent).has('llm-provider-factory');
  if (hasResult) {
    console.log('LLM provider factory already exists (shared with fae).');
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

  console.log('LLM provider factory created.');
};
harden(main);
