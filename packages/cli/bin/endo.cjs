#!/usr/bin/env node
/* global process */
(async () => {
  await import('amaro/strip');
  const { main } = await import('../src/endo.js');
  await main(process.argv.slice(2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
