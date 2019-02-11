/* global getAnonIntrinsics deepFreeze */

export default function hardenPrimoridals(global) {
  'use strict';

  const root = {
    global, // global plus all the namedIntrinsics
    anonIntrinsics: getAnonIntrinsics(global),
  };
  // todo: re-examine exactly which "global" we're freezing

  // this will change when we redefine def() into a harden() with a different
  // API (which does not traverse .__proto__)
  deepFreeze(root);
}
