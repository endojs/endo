// @ts-check
/* global process */
// endo run --UNCONFINED setup.js --powers @agent
//   -E GENIE_MODEL=ollama/llama3.2
//   -E GENIE_WORKSPACE=/path/to/workspace

/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/eventual-send';

const genieSpecifier = new URL('main.js', import.meta.url).href;

/**
 * Launch the genie root agent as an unconfined worklet running under
 * the daemon's host root agent (`@agent`).  Configuration is forwarded
 * via the `env` option so `main.js` can read `GENIE_*` values from the
 * `context.env` argument passed by `makeUnconfined`.  `GENIE_MODEL`
 * and `GENIE_WORKSPACE` are validated inside `main.js` at boot so
 * missing values fail loudly in the worker log instead of silently
 * exiting this launcher.
 *
 * Idempotent: on re-run, the `has('main-genie')` check short-circuits
 * so repeated `bottle.sh invoke` calls don't try to re-spawn an
 * already-running root agent.  A daemon restart reincarnates the
 * worker from the stored `main-genie` formula without a new
 * `setup.js` invocation.
 *
 * @param {EndoHost} hostAgent
 */
export const main = async hostAgent => {
  if (await E(hostAgent).has('main-genie')) {
    console.log('main-genie already running — skipping makeUnconfined.');
    return;
  }

  const { env } = process;
  await E(hostAgent).makeUnconfined('@main', genieSpecifier, {
    powersName: '@agent',
    resultName: 'main-genie',
    env: {
      GENIE_MODEL: env.GENIE_MODEL ?? '',
      GENIE_WORKSPACE: env.GENIE_WORKSPACE ?? '',
      GENIE_NAME: env.GENIE_NAME ?? 'main-genie',
      GENIE_HEARTBEAT_PERIOD: env.GENIE_HEARTBEAT_PERIOD ?? '',
      GENIE_HEARTBEAT_TIMEOUT: env.GENIE_HEARTBEAT_TIMEOUT ?? '',
      GENIE_OBSERVER_MODEL: env.GENIE_OBSERVER_MODEL ?? '',
      GENIE_REFLECTOR_MODEL: env.GENIE_REFLECTOR_MODEL ?? '',
      GENIE_AGENT_DIRECTORY: env.GENIE_AGENT_DIRECTORY ?? 'genie',
    },
  });
};
harden(main);
