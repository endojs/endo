// @ts-check

import harden from '@endo/harden';

/**
 * Probe an OpenAI-compatible endpoint for the models it advertises.
 *
 * Ollama (and llama.cpp) expose a lightweight `/v1/models` catalog.
 * Returns the advertised model ids, or `null` if the endpoint is
 * unreachable or returns an error — letting the caller distinguish
 * "not running" from "running but empty".
 *
 * @param {string} host - The API base URL (e.g. http://localhost:11434/v1).
 * @returns {Promise<string[] | null>}
 */
export const fetchAvailableModels = async host => {
  try {
    const modelsUrl = host.replace(/\/v1\/?$/, '/v1/models');
    const response = await fetch(modelsUrl, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return null;
    }
    const body = /** @type {{ data?: Array<{ id?: unknown }> }} */ (
      await response.json()
    );
    const data = Array.isArray(body.data) ? body.data : [];
    /** @type {string[]} */
    const ids = [];
    for (const entry of data) {
      if (typeof entry?.id === 'string') {
        ids.push(entry.id);
      }
    }
    return ids;
  } catch {
    return null;
  }
};
harden(fetchAvailableModels);

/**
 * Choose a model id from an advertised catalog, preferring the
 * configured default when installed, then a same-family prefix match
 * (so the `qwen3` default selects an installed `qwen3.6:latest`), then
 * the first advertised model. Returns `undefined` when the catalog is
 * empty.
 *
 * @param {string[]} available - Model ids advertised by the endpoint.
 * @param {string} preferred - The default model id to prefer.
 * @returns {string | undefined}
 */
export const chooseModel = (available, preferred) => {
  if (available.length === 0) {
    return undefined;
  }
  if (available.includes(preferred)) {
    return preferred;
  }
  const prefixMatch = available.find(id => id.startsWith(preferred));
  return prefixMatch ?? available[0];
};
harden(chooseModel);
