// @ts-check
/// <reference types="ses"/>

import { reincarnate } from '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { makeDurableZone } from '@agoric/zone/durable.js';


export const setupVomkit = fakeStore => {
  const { fakeVomKit } = reincarnate({
    relaxDurabilityRules: false,
    fakeStore,
  });
  const { vom, cm, vrm } = fakeVomKit;
  const flush = () => {
    vom.flushStateCache();
    cm.flushSchemaCache();
    vrm.flushIDCounters();
  };
  const baggage = cm.provideBaggage();
  return { baggage, flush, fakeVomKit };
};

export const setupZone = (fakeStore = new Map()) => {
  const { baggage, flush, fakeVomKit } = setupVomkit(fakeStore);
  const zone = makeDurableZone(baggage);
  return { zone, baggage, flush, fakeVomKit, fakeStore };
};
