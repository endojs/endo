#!/usr/bin/env node
/* global process */
(async () => {
  // Keep ts-blank-space until Node 22 is the least supported Node version.
  await import('ts-blank-space/register');
  const { main } = await import('../src/endo.js');
  await main(process.argv.slice(2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
