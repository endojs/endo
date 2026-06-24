// @ts-check
/* global fetch */

/**
 * Inference-engine (model) auto-detection shared by every Lal startup
 * path: the `endo run` setup scripts, the Chat bootstrap, the Familiar
 * bundle, and the Fae/Jaine provisioners. The goal is to never submit a
 * model the endpoint doesn't actually serve (e.g. the bare `qwen3`
 * default when only `qwen3.6:latest` is installed), which otherwise
 * surfaces at generation time as `404 model 'qwen3' not found`.
 */

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

/**
 * Resolve the model to submit for an endpoint. An explicit override
 * (e.g. `ENDO_LLM_MODEL`) always wins and skips the probe. Otherwise we
 * probe the endpoint's catalog and pick an installed model, falling
 * back to `fallback` when the endpoint is unreachable or advertises
 * nothing usable. Pure — performs no logging; callers inspect
 * `substituted` to report a substitution.
 *
 * @param {object} options
 * @param {string} options.host - The API base URL.
 * @param {string} [options.explicitModel] - A user-pinned model, if any.
 * @param {string} [options.fallback] - Default when nothing is detected.
 * @returns {Promise<{ model: string, fallback: string, substituted: boolean }>}
 */
export const resolveModel = async ({
  host,
  explicitModel,
  fallback = 'qwen3',
}) => {
  if (explicitModel) {
    return harden({ model: explicitModel, fallback, substituted: false });
  }
  const available = await fetchAvailableModels(host);
  const chosen = available ? chooseModel(available, fallback) : undefined;
  if (chosen && chosen !== fallback) {
    return harden({ model: chosen, fallback, substituted: true });
  }
  return harden({ model: chosen ?? fallback, fallback, substituted: false });
};
harden(resolveModel);
