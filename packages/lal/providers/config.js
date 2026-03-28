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
  if (baseURL.includes('googleapis.com') || baseURL.includes('generativelanguage')) {
    return 'gemini';
  }
  if (baseURL.includes('/v1')) {
    return 'openai-compatible';
  }
  return 'ollama';
};

/**
 * Resolve the model name, applying provider-specific defaults when
 * no explicit model is given.
 *
 * @param {string} baseURL
 * @param {string} [explicitModel]
 * @returns {string}
 */
export const resolveModelForHost = (baseURL, explicitModel) => {
  if (explicitModel) {
    return explicitModel;
  }
  const kind = detectProviderKind(baseURL);
  if (kind === 'anthropic') {
    return 'claude-sonnet-4-6-20250514';
  }
  if (kind === 'gemini') {
    return 'gemini-2.5-flash';
  }
  return 'qwen3';
};
