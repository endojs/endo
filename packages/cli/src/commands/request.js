/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';

export const request = async ({
  description,
  toName,
  resultName,
  partyNames,
}) => {
  await withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const result = await E(party).request(toName, description, resultName);
    console.log(result);
  });
};
