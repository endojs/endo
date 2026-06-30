// @ts-check
/* global process */
// endo run --UNCONFINED floot-factory-setup.js --powers @agent \
//   -E ANTHROPIC_API_KEY=sk-...   (optionally -E FLOOT_DIR=floot)
//
// Provisions the Floot factory under a `floot/` inventory directory as the
// well-known `floot/controller` — a single pinned caplet that owns every chat
// session (each session is its own guest, hidden behind the factory). The LLM
// is configured programmatically (Anthropic API endpoint by default) and handed
// to the factory behind an `llm-provider` capability handle, so no secret lives
// in env. Persistence is daemon-only.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { E } from '@endo/eventual-send';

const flootFactorySpecifier = new URL('agent.js', import.meta.url).href;

// Absolute host path to the Endo codebase, mounted read-only into full-control
// sessions. Default: the repo root, two directories up from this script
// (packages/floot/) — derivable because this setup script runs unconfined from
// its real on-disk location. Override with FLOOT_CODE_PATH (e.g. to mount a
// subset, or when the script is run from a copy outside the repo). Resolved to
// '' when the path does not exist on disk, which makes the factory skip the
// mount instead of failing per session.
const resolveCodePath = () => {
  const configured =
    process.env.FLOOT_CODE_PATH ||
    fileURLToPath(new URL('../../', import.meta.url));
  if (!existsSync(configured)) {
    console.warn(
      `Floot: code path "${configured}" does not exist; full-control sessions will have no source mount.`,
    );
    return '';
  }
  return configured;
};

/**
 * Provision (or revive) the floot-factory: its guest, its provider handle, the
 * pinned factory caplet, and a default session if none exist yet.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  // Everything lives under a single `floot/` inventory directory rather than
  // polluting the top level. The factory is the well-known `floot/controller`,
  // which the chat space's picker auto-detects.
  const dir = process.env.FLOOT_DIR || 'floot';
  const controllerPath = [dir, 'controller'];
  // `provideHost` takes a single pet-name (not a path), so the factory host and
  // its profile are created top-level and `move`d under `floot/` afterward.
  const guestName = `${dir}-controller-handle`;
  const agentName = `profile-for-${guestName}`;

  const provider = process.env.FLOOT_PROVIDER || 'anthropic';
  const model = process.env.FLOOT_MODEL || '';
  const authToken =
    process.env.ANTHROPIC_API_KEY || process.env.FLOOT_AUTH_TOKEN || '';
  const systemPrompt = process.env.FLOOT_SYSTEM_PROMPT || '';
  const codePath = resolveCodePath();

  if (provider === 'anthropic' && !authToken) {
    throw new Error(
      'ANTHROPIC_API_KEY (or FLOOT_AUTH_TOKEN) is required for the Anthropic provider.',
    );
  }

  // 0. Ensure the floot/ directory exists (idempotent on re-provision).
  if (!(await E(agent).has(dir))) {
    await E(agent).makeDirectory(dir);
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

  // 2. Store the provider config (incl. the API key) as a value under
  // `floot/llm-provider` and hand the factory a capability reference to it under
  // `llm-provider` — the fae pattern.
  if (await E(agent).has(dir, 'llm-provider')) {
    await E(agent).remove(dir, 'llm-provider');
  }
  await E(agent).storeValue(harden({ provider, model, authToken }), [
    dir,
    'llm-provider',
  ]);
  const providerLocator = await E(agent).locate(dir, 'llm-provider');
  await E(factoryHost).storeLocator('llm-provider', providerLocator);

  // 3. Launch the factory caplet straight into floot/controller.
  await E(agent).makeUnconfined('@main', flootFactorySpecifier, {
    powersName: agentName,
    resultName: controllerPath,
    env: harden({
      FLOOT_SYSTEM_PROMPT: systemPrompt,
      FLOOT_CODE_PATH: codePath,
    }),
  });

  // 4. Tuck the factory host + its profile under floot/ so the top level stays
  // clean. (The factory already resolved its powers in step 3; renaming the
  // pet-names afterward is cosmetic — formulas reference by identity.)
  await E(agent).move([guestName], [dir, 'controller-handle']);
  await E(agent).move([agentName], [dir, 'controller-profile']);

  // 5. Single pin: the factory revives all its sessions on daemon restart.
  await E(agent).copy(controllerPath, ['@pins', `${dir}-controller`]);
  console.log(`Floot factory created at "${dir}/controller" and pinned.`);

  // 6. Seed a default session if this is a fresh factory.
  const factory = await E(agent).lookup(controllerPath);
  const sessions = await E(factory).listSessions();
  if (sessions.length === 0) {
    await E(factory).createSession('New chat');
    console.log('Seeded a default session.');
  }
  console.log(
    `Ready (provider: ${provider}${model ? `, model: ${model}` : ''}${
      codePath ? `, code mount: ${codePath}` : ''
    }). Look up "${dir}/controller" and call createSession()/listSessions().`,
  );
};
harden(main);
