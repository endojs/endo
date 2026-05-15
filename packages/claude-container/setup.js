// @ts-check
/* global process */
// endo run --UNCONFINED setup.js --powers @agent \
//   -E FACTORY_NAME=claude-container-factory \
//   -E ORCHESTRATOR_SOCKET=/run/claude-orch/api.sock

import { E } from '@endo/eventual-send';

const factoryCapletSpecifier = new URL(
  'src/claude-container-factory.js',
  import.meta.url,
).href;

/**
 * Provision the Claude Container factory guest and launch its caplet.
 *
 * The factory presents a "Create Claude Container" form to @host.
 * Each submission resolves the named filesystem capability, spawns a
 * microVM through the host orchestrator (see DESIGN.md), and stores a
 * ClaudeClient exo back in @host's petstore.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const factoryName = process.env.FACTORY_NAME || 'claude-container-factory';
  const orchestratorSocket =
    process.env.ORCHESTRATOR_SOCKET || '/run/claude-orch/api.sock';

  if (await E(agent).has(`controller-for-${factoryName}`)) {
    console.log(
      `Factory "${factoryName}" already provisioned — skipping setup.`,
    );
    return;
  }

  const agentName = `profile-for-${factoryName}`;

  const hasFactory = await E(agent).has(factoryName);
  if (!hasFactory) {
    await E(agent).provideGuest(factoryName, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName,
    });
  }

  await E(agent).makeUnconfined('@main', factoryCapletSpecifier, {
    powersName: agentName,
    resultName: `controller-for-${factoryName}`,
    env: harden({ ORCHESTRATOR_SOCKET: orchestratorSocket }),
  });

  console.log(
    `Factory "${factoryName}" provisioned (orchestrator=${orchestratorSocket}).`,
  );
};
harden(main);
