/* eslint-disable no-await-in-loop */
/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const spawn = async ({
  cancel,
  cancelled,
  sockPath,
  petNames,
  partyNames,
}) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) =>
    Promise.all(petNames.map(petName => E(party).makeWorker(petName))),
  );
