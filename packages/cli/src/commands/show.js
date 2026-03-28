/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Format a value for display.
 * - Arrays render as a 0-indexed list.
 * - Plain objects render as a key/value table.
 * - Everything else uses default console.log.
 *
 * @param {unknown} value
 */
const formatValue = value => {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      console.log(`${i}. ${value[i]}`);
    }
    return;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      console.log('{}');
      return;
    }
    const maxKey = Math.max(...entries.map(([k]) => k.length));
    for (const [k, v] of entries) {
      console.log(`${k.padEnd(maxKey)}  ${v}`);
    }
    return;
  }
  console.log(value);
};

export const show = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const namePath = parsePetNamePath(name);
    let pet = await E(agent).lookup(namePath);
    if (typeof pet === 'string') {
      pet = pet.trim();
    }
    formatValue(pet);
  });
