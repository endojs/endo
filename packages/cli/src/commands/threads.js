/* global process */

import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const threads = async ({ agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const messages = await E(agent).listMessages();

    /** @type {Map<string, { count: number, firstDate: string, lastDate: string }>} */
    const threadMap = new Map();

    for (const message of messages) {
      const { threadId, date } = message;
      if (threadId !== undefined) {
        const existing = threadMap.get(threadId);
        if (existing) {
          existing.count += 1;
          existing.lastDate = date;
        } else {
          threadMap.set(threadId, {
            count: 1,
            firstDate: date,
            lastDate: date,
          });
        }
      }
    }

    if (threadMap.size === 0) {
      console.log('No threads found.');
      return;
    }

    for (const [threadId, info] of threadMap.entries()) {
      console.log(
        `${threadId}: ${info.count} message${info.count === 1 ? '' : 's'} (${info.firstDate} - ${info.lastDate})`,
      );
    }
  });
