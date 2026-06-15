// @ts-check
/* global process */
// endo run --UNCONFINED floot-factory-setup.js --powers @agent \
//   -E FACTORY_NAME=floot-factory -E ANTHROPIC_API_KEY=sk-...
//
// Provisions the Floot factory — a single pinned caplet that owns every chat
// session (each session is its own guest, hidden behind the factory). The LLM
// is configured programmatically (Anthropic API endpoint by default) and handed
// to the factory behind an `llm-provider` capability handle, so no secret lives
// in env. Persistence is daemon-only.

import { E } from '@endo/eventual-send';

const flootFactorySpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Provision (or revive) the floot-factory: its guest, its provider handle, the
 * pinned factory caplet, and a default session if none exist yet.
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
  const systemPrompt = process.env.FLOOT_SYSTEM_PROMPT || '';

  if (provider === 'anthropic' && !authToken) {
    throw new Error(
      'ANTHROPIC_API_KEY (or FLOOT_AUTH_TOKEN) is required for the Anthropic provider.',
    );
  }

  // 1. The factory is its own child host. It needs host authority because only
  // a host can `provideGuest`, and the factory provisions one guest per session.
  // (It must be a host, not a guest: a guest can only reach the host as a
  // mail-only Handle, which after a daemon restart can no longer provideGuest —
  // breaking session revival.) Sessions remain isolated guests owned by this
  // factory host.
  const factoryHost = await E(agent).provideHost(guestName, {
    agentName,
  });

  // 2. Store the provider config (incl. the API key) as a value and hand the
  // factory a capability reference to it under `llm-provider` — the fae pattern.
  const providerConfigName = `llm-provider-for-${factoryName}`;
  if (await E(agent).has(providerConfigName)) {
    await E(agent).remove(providerConfigName);
  }
  await E(agent).storeValue(
    harden({ provider, model, authToken }),
    providerConfigName,
  );
  const providerLocator = await E(agent).locate(providerConfigName);
  await E(factoryHost).storeLocator('llm-provider', providerLocator);

  // 3. Launch the factory caplet.
  await E(agent).makeUnconfined('@main', flootFactorySpecifier, {
    powersName: agentName,
    resultName: factoryName,
    env: harden({ FLOOT_SYSTEM_PROMPT: systemPrompt }),
  });

  // 4. Single pin: the factory revives all its sessions on daemon restart.
  await E(agent).copy([factoryName], ['@pins', factoryName]);
  console.log(`Floot factory "${factoryName}" created and pinned.`);

  // 5. Seed a default session if this is a fresh factory.
  const factory = await E(agent).lookup(factoryName);
  const sessions = await E(factory).listSessions();
  if (sessions.length === 0) {
    await E(factory).createSession('New chat');
    console.log('Seeded a default session.');
  }
  console.log(
    `Ready (provider: ${provider}${
      model ? `, model: ${model}` : ''
    }). Look up "${factoryName}" and call createSession()/listSessions().`,
  );
};
harden(main);
