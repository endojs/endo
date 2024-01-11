#!/usr/bin/env node
import '@endo/init';
import { main } from './main.js';

const { Fail } = assert;

/* global process */
const allowedModules = ['fs', 'path', 'url', 'crypto', 'timers', 'os'];
const loadModule = spec => {
  allowedModules.includes(spec) || Fail`Not allowed to import ${spec}`;
  return import(spec);
};

const log = (process.env.DEBUG || '').split(',').includes('bundle-source')
  ? console.warn
  : () => {};

// @ts-expect-error xxx args tuple
main(process.argv.slice(2), { loadModule, pid: process.pid, log }).catch(
  err => {
    console.error(err);
    process.exit(process.exitCode || 1);
  },
);
