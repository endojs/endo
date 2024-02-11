/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoBootstrap } from '../context.js';

export const show = async ({ cancel, cancelled, sockPath, namePath }) =>
  withEndoBootstrap({ os, process }, async ({ bootstrap }) => {
    const defaultHostFormulaIdentifier = 'host';
    const pet = await E(bootstrap).lookupFrom(
      defaultHostFormulaIdentifier,
      namePath,
    );
    console.log(pet);
  });
