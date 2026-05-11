// @ts-check
/* global process, setTimeout */
/* eslint-disable no-await-in-loop */
// endo run --UNCONFINED jaine-factory-setup.js --powers @agent \
//   -E PROVIDER_NAME=default -E FACTORY_NAME=jaine-factory

import { E } from '@endo/eventual-send';

const jaineFactorySpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Resolve a provider by name, retrying if not yet available.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 * @param {string} providerName
 * @returns {Promise<string>}
 */
const resolveProvider = async (agent, providerName) => {
  const maxAttempts = 5;
  const delayMs = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const id = /** @type {string} */ (await E(agent).identify(providerName));
      if (id) return id;
    } catch {
      // Not found yet
    }
    if (attempt < maxAttempts) {
      console.log(
        `Provider "${providerName}" not found, retrying (${attempt}/${maxAttempts})...`,
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `Provider "${providerName}" not found after ${maxAttempts} attempts. ` +
      `Run provider-setup first.`,
  );
};

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const providerName = process.env.PROVIDER_NAME || 'default';
  const factoryName = process.env.FACTORY_NAME || 'jaine-factory';
  const guestName = `${factoryName}-handle`;
  const agentName = `profile-for-${guestName}`;

  const providerId = await resolveProvider(agent, providerName);

  const hasFactory = await E(agent).has(guestName);
  if (!hasFactory) {
    await E(agent).provideGuest(guestName, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName,
    });
  }

  const factoryPowers = await E(agent).lookup(agentName);
  await E(factoryPowers).storeIdentifier('llm-provider', providerId);

  await E(agent).makeUnconfined('@main', jaineFactorySpecifier, {
    powersName: agentName,
    resultName: factoryName,
  });

  console.log(
    `Jaine factory "${factoryName}" created, bound to provider "${providerName}".`,
  );

  // Create default "jaine" agent instance, pinned for restart survival
  const factory = await E(agent).lookup(factoryName);
  const profileName = await E(factory).createAgent(
    'jaine',
    harden({ pin: true }),
  );
  console.log(
    `Default agent "jaine" created and pinned (profile: ${profileName}).`,
  );
};
harden(main);
