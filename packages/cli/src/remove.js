/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const remove = async ({
  cancel,
  cancelled,
  sockPath,
  petNames,
  partyNames,
}) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) =>
    Promise.all(petNames.map(petName => E(party).remove(petName))),
  );
