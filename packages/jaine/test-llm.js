#!/usr/bin/env node
// Quick test of the LLM provider using the same config Jaine uses.
// Run from repo root: node packages/jaine/test-llm.js
//
// Reads .env from repo root (same as yarn dev).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProvider } from '@endo/lal/providers/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');

// Load .env
const envPath = path.join(repoRoot, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log('Loaded .env from', envPath);
} else {
  console.log('No .env found at', envPath);
}

const host = process.env.ENDO_LLM_HOST || 'http://localhost:11434/v1';
const model = process.env.ENDO_LLM_MODEL || 'qwen3';
const authToken = process.env.ENDO_LLM_AUTH_TOKEN || 'ollama';

console.log(`\nPrimary provider: ${host} / ${model}`);
console.log(`Auth token: ${authToken ? authToken.slice(0, 12) + '...' : '(none)'}\n`);

try {
  const provider = createProvider({
    LAL_HOST: host,
    LAL_MODEL: model,
    LAL_AUTH_TOKEN: authToken,
  });

  console.log('Sending test message...');
  const response = await provider.chat(
    [
      { role: 'system', content: 'Reply with exactly: OK' },
      { role: 'user', content: 'Test' },
    ],
    [],
  );
  console.log('Response:', response.message?.content || JSON.stringify(response));
  console.log('\nPrimary provider: OK');
} catch (err) {
  console.error('Primary provider FAILED:', err.message || err);
  if (err.status) console.error('  HTTP status:', err.status);
  if (err.error) console.error('  Error body:', JSON.stringify(err.error));
}

// Test fast provider if configured
const fastModel = process.env.ENDO_LLM_FAST_MODEL;
if (fastModel) {
  const fastHost = process.env.ENDO_LLM_FAST_HOST || host;
  const fastAuthToken = process.env.ENDO_LLM_FAST_AUTH_TOKEN || authToken;

  console.log(`\nFast provider: ${fastHost} / ${fastModel}`);
  console.log(`Auth token: ${fastAuthToken ? fastAuthToken.slice(0, 12) + '...' : '(none)'}\n`);

  try {
    const fastProvider = createProvider({
      LAL_HOST: fastHost,
      LAL_MODEL: fastModel,
      LAL_AUTH_TOKEN: fastAuthToken,
    });

    console.log('Sending test message...');
    const response = await fastProvider.chat(
      [
        { role: 'system', content: 'Reply with exactly: OK' },
        { role: 'user', content: 'Test' },
      ],
      [],
    );
    console.log('Response:', response.message?.content || JSON.stringify(response));
    console.log('\nFast provider: OK');
  } catch (err) {
    console.error('Fast provider FAILED:', err.message || err);
    if (err.status) console.error('  HTTP status:', err.status);
    if (err.error) console.error('  Error body:', JSON.stringify(err.error));
  }
} else {
  console.log('\nNo ENDO_LLM_FAST_MODEL set, skipping fast provider test.');
}
