/* global process */

import os from 'os';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoAgent } from '../context.js';
import { formatMessage } from '../message-format.js';

export const inbox = async ({ follow, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const messages = follow
      ? makeRefIterator(E(agent).followMessages())
      : await E(agent).listMessages();
    for await (const message of messages) {
      const { number, who, when } = message;
      if (message.type === 'request') {
        const { what } = message;
        console.log(
          `${number}. ${JSON.stringify(who)} requested ${JSON.stringify(
            what,
          )} at ${JSON.stringify(when)}`,
        );
      } else if (message.type === 'package') {
        const { strings, names: edgeNames } = message;
        console.log(
          `${number}. ${JSON.stringify(who)} sent ${formatMessage(
            strings,
            edgeNames,
          )} at ${JSON.stringify(when)}`,
        );
      } else {
        console.log(
          `${number}. ${JSON.stringify(
            who,
          )} sent an unrecognizable message at ${JSON.stringify(
            when,
          )}. Consider upgrading.`,
        );
      }
    }
  });
