export default function getAllPrimordials(global, anonIntrinsics) {
  'use strict';

  const root = {
    global, // global plus all the namedIntrinsics
    anonIntrinsics,
  };
  // todo: re-examine exactly which "global" we're freezing

  return root;
}
