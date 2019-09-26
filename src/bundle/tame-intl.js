/* eslint-disable-next-line no-redeclare */
/* global Intl */

export default function tameIntl() {
  // todo: somehow fix these. These almost certainly don't enable the reading
  // of side-channels, but we want things to be deterministic across
  // runtimes. Best bet is to just disallow calling these functions without
  // an explicit locale name.

  // the whitelist may have deleted Intl entirely, so tolerate that
  if (typeof Intl !== 'undefined') {
    Intl.DateTimeFormat = () => {
      throw Error('disabled');
    };
    Intl.NumberFormat = () => {
      throw Error('disabled');
    };
    Intl.getCanonicalLocales = () => {
      throw Error('disabled');
    };
  }
  // eslint-disable-next-line no-extend-native
  Object.prototype.toLocaleString = () => {
    throw new Error('toLocaleString suppressed');
  };
}
