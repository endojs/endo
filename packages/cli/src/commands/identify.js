/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoBootstrap } from '../context.js';

export const identify = async ({ cancel, cancelled, sockPath, namePath }) =>
  withEndoBootstrap({ os, process }, async ({ bootstrap }) => {
    const defaultHostFormulaIdentifier = 'host';
    const formulaId = await E(bootstrap).identifyFrom(
      defaultHostFormulaIdentifier,
      namePath,
    );
    console.log(formulaId);
  });
