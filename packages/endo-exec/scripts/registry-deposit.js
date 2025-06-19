#! /usr/bin/env node
// @ts-check
import 'endo-exec';

/**
 * @import {Main} from 'endo-exec';
 * @import {ImportConfined} from './endo-gogo.js';
 */

const dbg = x => {
  console.log('@@DEBUG', x);
  return x;
};

/** @type {Main<{ importConfined: ImportConfined}>} */
export const main = async ([_script, amt], _env, { importConfined }) => {
  const { makeSmartWalletKit } = await importConfined(
    '@agoric/client-utils/src/smart-wallet-kit.js',
    () => import('@agoric/client-utils/src/smart-wallet-kit.js'),
  );

  /** @param {number} ms */
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const w1 = makeSmartWalletKit(
    { fetch: globalThis.fetch, delay },
    { help: 'me' },
  );
  //   const offer = { instance: 'registry', proposal: { give: amt } };
  //   const seat = w1.executeOffer(offer);
  //   const payouts = await seat.getPayouts();
  //   console.log({ payouts });
};
