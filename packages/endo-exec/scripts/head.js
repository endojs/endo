#! /usr/bin/env node
import 'endo-exec';

import { $ } from 'execa';

/** @type {import('endo-exec').Main} */
export const main = async ([script, file]) => {
  console.log(`Hello, world (from ${script})!`);
  const { stdout } = await $`head -5 ${file}`;
  console.log(stdout);
};
