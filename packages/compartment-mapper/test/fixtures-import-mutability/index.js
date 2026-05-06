/* eslint-env node */
import { getResults as esmFromEsm } from './consumer-esm-from-esm.mjs';
import {
  getResults as esmFromCjs,
  getResultsOverwrite as esmFromCjsOw,
} from './consumer-esm-from-cjs.mjs';

import {
  getResults as cjsFromCjs,
  getResultsOverwrite as cjsFromCjsOw,
} from './consumer-cjs-from-cjs.cjs';
import { getResults as cjsFromEsm } from './consumer-cjs-from-esm.cjs';

export const getSummary = async () => {
  // Wait for mutations (50ms)
  await new Promise(resolve => setTimeout(resolve, 100));

  // Collect all results
  const results = [
    esmFromEsm(),
    esmFromCjs(),
    esmFromCjsOw(),
    cjsFromCjs(),
    cjsFromCjsOw(),
    cjsFromEsm(),
  ];

  const summary = {};
  // Display before/after comparison
  for (const result of results) {
    const { title, ...values } = result;
    summary[title] = {};
    for (const [key, { before, after }] of Object.entries(values)) {
      const propagated = before !== after ? '✓ LIVE' : '✗ STATIC';
      summary[title][key] = propagated;
    }
  }

  return summary;
};
