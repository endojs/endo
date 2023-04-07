#!/usr/bin/env node
import '@endo/init';
import { main } from './main.js';

const { Fail } = assert;

/* global process */
const allowedModules = ['fs', 'path', 'url', 'crypto', 'timers'];
const loadModule = spec => {
  allowedModules.includes(spec) || Fail`Not allowed to import ${spec}`;
  return import(spec);
};
main(process.argv.slice(2), { loadModule }).catch(err => {
  console.error(err);
  process.exit(process.exitCode || 1);
});
