// @ts-check
/* global process, setTimeout */
/* eslint-disable no-await-in-loop */
// Comprehensive Jaine auto-provisioning.
// Called via ENDO_EXTRA (yarn dev) or: endo run --UNCONFINED setup.js --powers @agent
//
// Defaults to local Ollama. Override with env vars:
//   ENDO_LLM_HOST=https://api.anthropic.com
//   ENDO_LLM_MODEL=claude-sonnet-4-6-20250514
//   ENDO_LLM_AUTH_TOKEN=sk-ant-...
//
// Optional fast model for routing decisions (falls back to main if unset):
//   ENDO_LLM_FAST_MODEL=claude-haiku-4-5-20251001
//   ENDO_LLM_FAST_HOST=...          (defaults to ENDO_LLM_HOST)
//   ENDO_LLM_FAST_AUTH_TOKEN=...    (defaults to ENDO_LLM_AUTH_TOKEN)

import { E } from '@endo/eventual-send';

const jaineFactorySpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Poll until a petname exists in the host namespace.
 *
 * @param {any} agent
 * @param {string} name
 * @param {number} [maxAttempts]
 * @param {number} [delayMs]
 * @returns {Promise<boolean>}
 */
const waitForName = async (agent, name, maxAttempts = 15, delayMs = 1000) => {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await E(agent).has(name)) return true;
    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return false;
};
harden(waitForName);

/**
 * Find a pending "Create LLM Provider" form in HOST's inbox, retrying
 * since the factory caplet sends it asynchronously after launch.
 *
 * @param {any} agent
 * @param {number} [maxAttempts]
 * @param {number} [delayMs]
 * @returns {Promise<any>}
 */
const findProviderForm = async (agent, maxAttempts = 10, delayMs = 1000) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const messages = /** @type {any[]} */ (await E(agent).listMessages());
    for (const msg of messages) {
      if (msg.type === 'form' && msg.description === 'Create LLM Provider') {
        return msg;
      }
    }
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
};
harden(findProviderForm);

/**
 * Submit provider config if one doesn't already exist under the given name.
 *
 * @param {any} agent
 * @param {string} providerName
 * @param {string} host
 * @param {string} model
 * @param {string} authToken
 * @returns {Promise<void>}
 */
const ensureProvider = async (agent, providerName, host, model, authToken) => {
  // Already exists?
  try {
    const id = /** @type {string} */ (await E(agent).identify(providerName));
    if (id) {
      console.log(`[jaine] Provider "${providerName}" already exists.`);
      return;
    }
  } catch {
    // Not found — submit the form
  }

  const form = await findProviderForm(agent);
  if (!form) {
    console.warn(
      '[jaine] No "Create LLM Provider" form found — cannot auto-provision provider.',
    );
    return;
  }

  await E(agent).submit(
    BigInt(form.number),
    harden({ name: providerName, host, model, authToken }),
  );
  console.log(
    `[jaine] Provider "${providerName}" submitted (host=${host}, model=${model}).`,
  );
};
harden(ensureProvider);

/**
 * Resolve a provider formula ID by name, retrying until it appears.
 *
 * @param {any} agent
 * @param {string} providerName
 * @returns {Promise<string>}
 */
const resolveProvider = async (agent, providerName) => {
  const maxAttempts = 10;
  const delayMs = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const id = /** @type {string} */ (await E(agent).identify(providerName));
      if (id) return id;
    } catch {
      // Not found yet
    }
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `[jaine] Provider "${providerName}" not found after ${maxAttempts} attempts.`,
  );
};
harden(resolveProvider);

/**
 * Auto-provision Jaine: ensure LLM provider, create factory, create
 * default agent. Idempotent — skips if jaine-factory already exists.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  if (await E(agent).has('jaine-factory')) {
    console.log('[jaine] Already provisioned — skipping setup.');
    return;
  }

  const { env } = process;
  const providerName = env.ENDO_LLM_NAME || 'default';
  const llmHost = env.ENDO_LLM_HOST || 'http://localhost:11434/v1';
  const llmModel = env.ENDO_LLM_MODEL || 'qwen3';
  const llmAuthToken = env.ENDO_LLM_AUTH_TOKEN || 'ollama';

  // Optional fast model for lightweight decisions (routing, triage).
  // Falls back to main provider values so you can just set ENDO_LLM_FAST_MODEL
  // to use a cheaper model on the same API.
  const fastHost = env.ENDO_LLM_FAST_HOST || llmHost;
  const fastModel = env.ENDO_LLM_FAST_MODEL;
  const fastAuthToken = env.ENDO_LLM_FAST_AUTH_TOKEN || llmAuthToken;
  const hasFastConfig = Boolean(fastModel);

  // Wait for fae's llm-provider-factory (created by fae setup.js)
  console.log('[jaine] Waiting for llm-provider-factory...');
  const hasProviderFactory = await waitForName(agent, 'llm-provider-factory');
  if (!hasProviderFactory) {
    console.warn(
      '[jaine] llm-provider-factory not found. Ensure fae setup runs first.',
    );
    return;
  }

  // Ensure provider configs exist (submit forms if needed)
  await ensureProvider(agent, providerName, llmHost, llmModel, llmAuthToken);
  const fastProviderName = `${providerName}-fast`;
  if (hasFastConfig) {
    await ensureProvider(
      agent,
      fastProviderName,
      fastHost,
      /** @type {string} */ (fastModel),
      fastAuthToken,
    );
  }

  // Resolve the provider formula ID (retries for async processing)
  const providerId = await resolveProvider(agent, providerName);

  // Create jaine-factory guest
  const factoryName = 'jaine-factory';
  const guestName = `${factoryName}-handle`;
  const agentName = `profile-for-${guestName}`;

  const hasGuest = await E(agent).has(guestName);
  if (!hasGuest) {
    await E(agent).provideGuest(guestName, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName,
    });
  }

  // Write provider references into the factory's namespace
  const factoryPowers = await E(agent).lookup(agentName);
  await E(factoryPowers).storeIdentifier('llm-provider', providerId);

  if (hasFastConfig) {
    const fastProviderId = await resolveProvider(agent, fastProviderName);
    await E(factoryPowers).storeIdentifier('llm-provider-fast', fastProviderId);
    console.log(`[jaine] Fast provider "${fastProviderName}" configured.`);
  }

  // Launch the jaine factory caplet
  await E(agent).makeUnconfined('@main', jaineFactorySpecifier, {
    powersName: agentName,
    resultName: factoryName,
  });

  console.log('[jaine] Factory created.');

  // Create default "jaine" agent, pinned for restart survival
  const factory = await E(agent).lookup(factoryName);
  const profileName = await E(factory).createAgent(
    'jaine',
    harden({ pin: true }),
  );
  console.log(
    `[jaine] Default agent "jaine" created and pinned (profile: ${profileName}).`,
  );
};
harden(main);
