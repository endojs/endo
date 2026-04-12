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
    const selfLocator = await E(agent).locate('@self');
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
      } else if (type === 'definition') {
        verb = 'proposed definition';
      } else if (type === 'form') {
        verb = 'sent form';
      } else if (type === 'value') {
        verb = 'sent value';
      } else {
        verb = 'sent an unrecognizable message';
      }

      let provenance = 'unrecognizable message';
      if (from === selfLocator && to === selfLocator) {
        provenance = `you ${verb} yourself `;
      } else if (from === selfLocator) {
        const [toName] = await E(agent).reverseLocate(to);
        if (toName === undefined) {
          continue;
        }
        provenance = `${verb} ${q(toName)} `;
      } else if (to === selfLocator) {
        const [fromName] = await E(agent).reverseLocate(from);
        if (fromName === undefined) {
          continue;
        }
        provenance = `${q(fromName)} ${verb} `;
      } else {
        const [toName] = await E(agent).reverseLocate(to);
        const [fromName] = await E(agent).reverseLocate(from);
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
      } else if (message.type === 'definition') {
        const { source, slots } = message;
        const slotNames = Object.keys(slots || {}).join(', ');
        const slotInfo = slotNames ? ` (slots: ${slotNames})` : '';
        console.log(
          `${number}. ${provenance}${q(source)}${slotInfo} at ${q(date)}`,
        );
      } else if (message.type === 'form') {
        const { description, fields } = message;
        const fieldNames = (fields || []).map(f => f.name).join(', ');
        const fieldInfo = fieldNames ? ` (fields: ${fieldNames})` : '';
        console.log(
          `${number}. ${provenance}${q(description)}${fieldInfo} at ${q(date)}`,
        );
      } else if (message.type === 'value') {
        const { replyTo } = message;
        const replyNumber = messageNumberById.get(replyTo);
        const replyContext =
          replyNumber === undefined ? 'unknown' : `#${replyNumber}`;
        console.log(
          `${number}. ${provenance}in reply to ${replyContext} at ${q(date)}`,
        );
      } else {
        console.log(`${number}. ${provenance}, consider upgrading.`);
      }
    }
  });
