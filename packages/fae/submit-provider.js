// @ts-check
/* global process */
// endo run --UNCONFINED submit-provider.js --powers @agent \
//   -E PROVIDER_NAME=default \
//   -E LAL_HOST=https://api.anthropic.com \
//   -E LAL_MODEL=claude-sonnet-4-6-20250514 \
//   -E LAL_AUTH_TOKEN=sk-ant-...

import { E } from '@endo/eventual-send';
import { resolveModel } from '@endo/lal/model-detect.js';

/**
 * Find the pending "Create LLM Provider" form in HOST's inbox
 * and submit values from environment variables.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const messages = /** @type {any[]} */ (await E(agent).listMessages());

  /** @type {any} */
  let targetForm = null;
  for (const msg of messages) {
    if (msg.type === 'form' && msg.description === 'Create LLM Provider') {
      targetForm = msg;
    }
  }

  if (!targetForm) {
    throw new Error(
      'No pending "Create LLM Provider" form found. Run `yarn setup` first.',
    );
  }

  const name = process.env.PROVIDER_NAME || 'default';
  const host = process.env.LAL_HOST || 'https://api.anthropic.com';
  const authToken = process.env.LAL_AUTH_TOKEN;

  if (!authToken) {
    throw new Error('LAL_AUTH_TOKEN environment variable is required.');
  }

  // Reconcile the model against the endpoint's catalog when one isn't
  // pinned. For the Anthropic default host the probe simply no-ops (no
  // `/v1/models`) and the fallback stands; for a local endpoint it picks
  // an installed model instead of one the server would 404 on.
  const { model, substituted } = await resolveModel({
    host,
    explicitModel: process.env.LAL_MODEL,
    fallback: 'claude-sonnet-4-6-20250514',
  });
  if (substituted) {
    console.log(`Detected installed model at ${host} — using ${model}.`);
  }

  await E(agent).submit(
    BigInt(targetForm.number),
    harden({ name, host, model, authToken }),
  );

  console.log(`Provider "${name}" submitted (host=${host}, model=${model}).`);
};
harden(main);
