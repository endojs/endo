/* global Intl */

export default function tameIntl() {
  // todo: somehow fix these. These almost certainly don't enable the reading
  // of side-channels, but we want things to be deterministic across
  // runtimes. Best bet is to just disallow calling these functions without
  // an explicit locale name.
  Intl.DateTimeFormat = () => { throw Error("disabled"); };
  Intl.NumberFormat = () => { throw Error("disabled"); };
  Intl.getCanonicalLocales = () => { throw Error("disabled"); };
  Object.prototype.toLocaleString = () => {
    throw new Error('toLocaleString suppressed');
  };
}
