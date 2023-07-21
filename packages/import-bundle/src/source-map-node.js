/* global process */
import url from 'node:url';
import os from 'node:os';
import { makeEndoSourceMapLocator } from './source-map-node-powers.js';

export const computeSourceMapLocation = makeEndoSourceMapLocator({
  url,
  os,
  process,
});
