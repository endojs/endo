// @ts-check
/**
 * Provider detection and model resolution helpers.
 */

/**
 * Detect the provider kind from a base URL.
 *
 * @param {string} baseURL
 * @returns {'anthropic' | 'gemini' | 'openai-compatible' | 'ollama'}
 */
export const detectProviderKind = baseURL => {
  if (baseURL.includes('anthropic.com')) {
    return 'anthropic';
  }
  if (
    baseURL.includes('googleapis.com') ||
    baseURL.includes('generativelanguage')
  ) {
    return 'gemini';
  }
  if (baseURL.includes('/v1')) {
    return 'openai-compatible';
  }
  return 'ollama';
};
harden(detectProviderKind);

/** @type {Record<string, string>} */
const defaultModels = {
  anthropic: 'claude-sonnet-4-6-20250514',
  gemini: 'gemini-2.5-pro',
  'openai-compatible': 'qwen3',
  ollama: 'qwen3',
};
harden(defaultModels);

/**
 * Return the default model for a given host URL.
 *
 * @param {string} baseURL
 * @returns {string}
 */
export const getDefaultModelForHost = baseURL => {
  const kind = detectProviderKind(baseURL);
  return defaultModels[kind] || 'qwen3';
};
harden(getDefaultModelForHost);

/**
 * Resolve the model name, applying provider-specific defaults when
 * no explicit model is given.  When the explicit model is the
 * generic fallback `'qwen3'` but the provider has its own default,
 * upgrade to the provider-specific model so that users who
 * configured before provider detection was added get the right
 * model automatically.
 *
 * @param {string} baseURL
 * @param {string} [explicitModel]
 * @returns {string}
 */
export const resolveModelForHost = (baseURL, explicitModel) => {
  const providerDefault = getDefaultModelForHost(baseURL);
  if (!explicitModel || explicitModel === 'qwen3') {
    return providerDefault;
  }
  return explicitModel;
};
harden(resolveModelForHost);
