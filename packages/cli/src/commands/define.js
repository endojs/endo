/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

/**
 * Parse --slot arguments into a slots record.
 * Each slot is "codeName:label" e.g. "counter:A counter to increment"
 *
 * @param {string[]} slotArgs
 * @returns {Record<string, { label: string }>}
 */
const parseSlots = slotArgs => {
  /** @type {Record<string, { label: string }>} */
  const slots = Object.create(null);
  for (const arg of slotArgs) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `Invalid slot format ${JSON.stringify(arg)}, expected "codeName:label"`,
      );
    }
    const codeName = arg.slice(0, colonIndex);
    const label = arg.slice(colonIndex + 1);
    slots[codeName] = { label };
  }
  return slots;
};

export const defineCommand = async ({ source, slotArgs, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const slots = parseSlots(slotArgs);
    const result = await E(agent).define(source, slots);
    console.log(result);
  });
