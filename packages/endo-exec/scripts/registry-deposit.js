#! /usr/bin/env node
import 'endo-exec';

const dbg = x => {
  console.log('@@DEBUG', x);
  return x;
};

/** @type {import('endo-exec').Main} */
export const main = async ([_script, amt], _env, { importConfined }) => {
  const { makeWallet } = await importConfined('./smart-wallet-lib.js');
  const w1 = makeWallet({ fetch: globalThis.fetch });
  const offer = { instance: 'registry', proposal: { give: amt } };
  const seat = w1.executeOffer(offer);
  const payouts = await seat.getPayouts();
  console.log({ payouts });
};
