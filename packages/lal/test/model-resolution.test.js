import test from '@endo/ses-ava/prepare-endo.js';
import { makeEnvCredentials } from '@endo/agentry/harness';

import { makeWorkerGetApiKey } from '../model-resolution.js';

// The resolved Ollama model masquerades as the 'openai' provider, so that is
// the provider name pi-agent-core passes the getApiKey hook for an Ollama
// worker.
const OLLAMA_PROVIDER = 'openai';

test('Ollama worker honors the per-worker authToken when no OLLAMA_API_KEY is set', t => {
  // Regression: a worker configured via the Lal form with a real LAL_AUTH_TOKEN
  // must authenticate against a protected / remote Ollama. The prior
  // setProviderApiKey path copied LAL_AUTH_TOKEN into OLLAMA_API_KEY; dropping
  // the token here silently returned only the 'ollama' sentinel.
  const credentials = makeEnvCredentials({});
  const getApiKey = makeWorkerGetApiKey(credentials, 'worker-token', true);
  t.is(getApiKey(OLLAMA_PROVIDER), 'worker-token');
});

test('Ollama worker prefers a real OLLAMA_API_KEY over the authToken', t => {
  const credentials = makeEnvCredentials({ OLLAMA_API_KEY: 'real-key' });
  const getApiKey = makeWorkerGetApiKey(credentials, 'worker-token', true);
  t.is(getApiKey(OLLAMA_PROVIDER), 'real-key');
});

test('Ollama worker treats the OLLAMA_API_KEY sentinel as unset so the authToken overrides it', t => {
  const credentials = makeEnvCredentials({ OLLAMA_API_KEY: 'ollama' });
  const getApiKey = makeWorkerGetApiKey(credentials, 'worker-token', true);
  t.is(getApiKey(OLLAMA_PROVIDER), 'worker-token');
});

test('Ollama worker falls back to the sentinel when neither key nor authToken is present', t => {
  const credentials = makeEnvCredentials({});
  const getApiKey = makeWorkerGetApiKey(credentials, undefined, true);
  t.is(getApiKey(OLLAMA_PROVIDER), 'ollama');
});

test('non-Ollama worker prefers a real provider key over the authToken', t => {
  const credentials = makeEnvCredentials({ ANTHROPIC_API_KEY: 'real-key' });
  const getApiKey = makeWorkerGetApiKey(credentials, 'worker-token', false);
  t.is(getApiKey('anthropic'), 'real-key');
});

test('non-Ollama worker supplies the authToken when no provider key is set', t => {
  const credentials = makeEnvCredentials({});
  const getApiKey = makeWorkerGetApiKey(credentials, 'worker-token', false);
  t.is(getApiKey('anthropic'), 'worker-token');
});
