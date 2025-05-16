#! /usr/bin/env endo-exec
import { $ } from 'execa';

/** @type {import('endo-exec').OnEndoExec} */
export const onEndoExec = async ({
  process: {
    argv: [script, file],
  },
}) => {
  console.log(`Hello, world (from ${script})!`);
  const { stdout } = await $`head -5 ${file}`;
  console.log(stdout);
};
