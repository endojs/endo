/* global process */
// @ts-check
// endo run --UNCONFINED setup-with-tools.js \
//   --powers @agent \
//   -E PROVIDER_NAME=$PROVIDER_NAME \
//   -E FACTORY_NAME=$FACTORY_NAME
//
// Creates tools in the host inventory, sets up the llm-provider-factory,
// then creates a fae-factory with those tools available.

import { E } from '@endo/eventual-send';

const llmProviderFactorySpecifier = new URL(
  'llm-provider-factory.js',
  import.meta.url,
).href;
const faeFactorySpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Provision tools, the provider factory, and a fae-factory in one shot.
 *
 * This is a convenience script that orchestrates the multi-step setup.
 * For more control, use the individual scripts:
 *   1. yarn setup          (install llm-provider-factory)
 *   2. yarn create-provider (submit provider config via .env)
 *   3. yarn setup-factory   (create fae-factory bound to provider)
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const providerName = process.env.PROVIDER_NAME || 'default';
  const factoryName = process.env.FACTORY_NAME || 'fae-factory';

  // 1. Create tools in host inventory
  const greetUrl = new URL('tools/greet.js', import.meta.url).href;
  const mathUrl = new URL('tools/math.js', import.meta.url).href;
  const timestampUrl = new URL('tools/timestamp.js', import.meta.url).href;

  await E(agent).makeUnconfined('@main', greetUrl, {
    resultName: 'greet-tool',
  });
  console.log('[setup] Created greet-tool');

  await E(agent).makeUnconfined('@main', mathUrl, {
    resultName: 'math-tool',
  });
  console.log('[setup] Created math-tool');

  await E(agent).makeUnconfined('@main', timestampUrl, {
    resultName: 'timestamp-tool',
  });
  console.log('[setup] Created timestamp-tool');

  // 2. Install the llm-provider-factory
  const providerFactoryGuest = 'llm-provider-factory-handle';
  const providerFactoryAgent = `profile-for-${providerFactoryGuest}`;
  const hasProviderFactory = await E(agent).has(providerFactoryGuest);
  if (!hasProviderFactory) {
    await E(agent).provideGuest(providerFactoryGuest, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName: providerFactoryAgent,
    });
  }
  await E(agent).makeUnconfined('@main', llmProviderFactorySpecifier, {
    powersName: providerFactoryAgent,
    resultName: 'llm-provider-factory',
  });
  console.log('[setup] LLM provider factory installed');
  console.log('[setup] Submit provider config via: yarn create-provider');

  // 3. Create the fae-factory (will fail until a provider is submitted)
  const factoryGuestName = `${factoryName}-handle`;
  const factoryAgent = `profile-for-${factoryGuestName}`;
  const hasProvider = await E(agent).has(providerName);
  if (hasProvider) {
    const providerId = /** @type {string} */ (
      await E(agent).identify(providerName)
    );

    const hasFactory = await E(agent).has(factoryGuestName);
    if (!hasFactory) {
      await E(agent).provideGuest(factoryGuestName, {
        introducedNames: harden({ '@agent': 'host-agent' }),
        agentName: factoryAgent,
      });
    }

    const factoryPowers = await E(agent).lookup(factoryAgent);
    await E(factoryPowers).write('llm-provider', providerId);

    await E(agent).makeUnconfined('@main', faeFactorySpecifier, {
      powersName: factoryAgent,
      resultName: factoryName,
    });
    console.log(
      `[setup] Fae factory "${factoryName}" created, bound to provider "${providerName}"`,
    );
  } else {
    console.log(
      `[setup] Provider "${providerName}" not found yet. After submitting provider config, run: yarn setup-factory`,
    );
  }
};
harden(main);
