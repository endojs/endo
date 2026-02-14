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
    const messages = follow
      ? makeRefIterator(E(agent).followMessages())
      : await E(agent).listMessages();
    for await (const message of messages) {
      const { number, type, fromNames, date } = message;
      const fromName = fromNames[0];
      const isSelf = fromNames.includes('SELF');

      let verb = '';
      if (type === 'request') {
        verb = 'requested';
      } else if (type === 'package') {
        verb = message.replyTo === undefined ? 'sent' : 'replied to';
      } else if (type === 'eval-request') {
        verb = 'requested evaluation of';
      } else if (type === 'definition') {
        verb = 'proposed definition';
      } else if (type === 'form-request') {
        verb = 'sent form';
      } else {
        verb = 'sent an unrecognizable message';
      }

      const senderLabel = fromName !== undefined ? q(fromName) : 'unknown';
      const provenance = isSelf ? `you ${verb} ` : `${senderLabel} ${verb} `;

      if (message.type === 'request') {
        const { description } = message;
        console.log(
          `${number}. ${provenance}${q(description)} at ${q(date)}`,
        );
      } else if (message.type === 'package') {
        const { strings, names: edgeNames } = message;
        console.log(
          `${number}. ${provenance}${formatMessage(
            strings,
            edgeNames,
          )} at ${q(date)}`,
        );
      } else if (message.type === 'eval-request') {
        const { source, codeNames } = message;
        const codeNameList = /** @type {string[]} */ (codeNames);
        const endowments =
          codeNameList.length > 0
            ? ` with endowments: ${codeNameList.join(', ')}`
            : '';
        console.log(
          `${number}. ${provenance}${q(source)}${endowments} at ${q(date)}`,
        );
      } else if (message.type === 'definition') {
        const { source, slots } = message;
        const slotNames = Object.keys(slots || {}).join(', ');
        const slotInfo = slotNames ? ` (slots: ${slotNames})` : '';
        console.log(
          `${number}. ${provenance}${q(source)}${slotInfo} at ${q(date)}`,
        );
      } else if (message.type === 'form-request') {
        const { description, fields } = message;
        const fieldNames = Object.keys(fields || {}).join(', ');
        const fieldInfo = fieldNames ? ` (fields: ${fieldNames})` : '';
        console.log(
          `${number}. ${provenance}${q(description)}${fieldInfo} at ${q(date)}`,
        );
      } else {
        console.log(`${number}. ${provenance}, consider upgrading.`);
      }
    }
  });
