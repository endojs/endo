/* global process */
/* eslint-disable no-continue */

import os from 'os';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoAgent } from '../context.js';
import { formatMessage } from '../message-format.js';

const { stringify: q } = JSON;

export const inbox = async ({ follow, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const selfId = await E(agent).identify('SELF');
    const messages = follow
      ? makeRefIterator(E(agent).followMessages())
      : await E(agent).listMessages();
    for await (const message of messages) {
      const { number, type, from, to, date } = message;

      let verb = '';
      if (type === 'request') {
        verb = 'requested';
      } else if (type === 'package') {
        verb = 'sent';
      } else {
        verb = 'sent an unrecognizable message';
      }

      let provenance = 'unrecognizable message';
      if (from === selfId && to === selfId) {
        provenance = `you ${verb} yourself `;
      } else if (from === selfId) {
        const [toName] = await E(agent).reverseIdentify(to);
        if (toName === undefined) {
          continue;
        }
        provenance = `${verb} ${q(toName)} `;
      } else if (to === selfId) {
        const [fromName] = await E(agent).reverseIdentify(from);
        if (fromName === undefined) {
          continue;
        }
        provenance = `${q(fromName)} ${verb} `;
      } else {
        const [toName] = await E(agent).reverseIdentify(to);
        const [fromName] = await E(agent).reverseIdentify(from);
        if (fromName === undefined || toName === undefined) {
          continue;
        }
        provenance = `${q(fromName)} ${verb} ${q(toName)} `;
      }

      if (message.type === 'request') {
        const { description } = message;
        console.log(
          `${number}. ${provenance}${JSON.stringify(
            description,
          )} at ${JSON.stringify(date)}`,
        );
      } else if (message.type === 'package') {
        const { strings, names: edgeNames } = message;
        console.log(
          `${number}. ${provenance}${formatMessage(
            strings,
            edgeNames,
          )} at ${JSON.stringify(date)}`,
        );
      } else {
        console.log(`${number}. ${provenance}, consider upgrading.`);
      }
    }
  });
