// @ts-check
/* global process */
// endo run --UNCONFINED floot-factory-setup.js --powers @agent \
//   -E FACTORY_NAME=floot-factory -E ANTHROPIC_API_KEY=sk-...
//
// Provisions a Floot factory and a default pinned streaming agent. The LLM is
// configured programmatically (Anthropic API endpoint by default), so no fae
// provider config is required — just an API key.

import { E } from '@endo/eventual-send';

const flootFactorySpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Create a floot-factory guest, then spawn a default streaming agent instance
 * bound to a programmatically configured (default: Anthropic API) provider.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const factoryName = process.env.FACTORY_NAME || 'floot-factory';
  const guestName = `${factoryName}-handle`;
  const agentName = `profile-for-${guestName}`;

  const provider = process.env.FLOOT_PROVIDER || 'anthropic';
  const model = process.env.FLOOT_MODEL || '';
  const authToken =
    process.env.ANTHROPIC_API_KEY || process.env.FLOOT_AUTH_TOKEN || '';

  if (provider === 'anthropic' && !authToken) {
    throw new Error(
      'ANTHROPIC_API_KEY (or FLOOT_AUTH_TOKEN) is required for the Anthropic provider.',
    );
  }

  const hasFactory = await E(agent).has(guestName);
  if (!hasFactory) {
    await E(agent).provideGuest(guestName, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName,
    });
  }

  await E(agent).makeUnconfined('@main', flootFactorySpecifier, {
    powersName: agentName,
    resultName: factoryName,
  });

  console.log(`Floot factory "${factoryName}" created.`);

  // Create a default "floot" streaming agent, pinned to survive restarts.
  const factory = await E(agent).lookup(factoryName);
  const driverName = await E(factory).createAgent(
    'floot',
    harden({ pin: true, provider, model, authToken }),
  );
  console.log(
    `Default streaming agent created and pinned (provider: ${provider}${
      model ? `, model: ${model}` : ''
    }). Look up "${driverName}" and call converse(text).`,
  );
};
harden(main);
