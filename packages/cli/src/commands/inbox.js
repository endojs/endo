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
    const messageNumberById = new Map();
    if (!follow) {
      for (const message of messages) {
        messageNumberById.set(message.messageId, message.number);
      }
    }
    for await (const message of messages) {
      messageNumberById.set(message.messageId, message.number);
      const { number, type, from, to, date } = message;

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
        const { strings, names: edgeNames, replyTo } = message;
        let replyContext = '';
        if (replyTo !== undefined) {
          const replyNumber = messageNumberById.get(replyTo);
          replyContext =
            replyNumber === undefined
              ? ' (in reply to unknown)'
              : ` (in reply to ${replyNumber})`;
        }
        console.log(
          `${number}. ${provenance}${formatMessage(
            strings,
            edgeNames,
          )}${replyContext} at ${JSON.stringify(date)}`,
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
