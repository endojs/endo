const { defineProperties } = Object;

export default function tameGlobalIntlObject() {
  // todo: somehow fix these. These almost certainly don't enable the reading
  // of side-channels, but we want things to be deterministic across
  // runtimes. Best bet is to just disallow calling these functions without
  // an explicit locale name.

  // The whitelist may have deleted Intl entirely, so tolerate that.
  if (typeof Intl !== 'undefined') {
    defineProperties(Intl, {
      DateTimeFormat: {
        value: function DateTimeFormat() {
          throw Error('disabled');
        },
        enumerable: false,
        configurable: true,
        writable: true,
      },

      NumberFormat: {
        value: function NumberFormat() {
          throw Error('disabled');
        },
        enumerable: false,
        configurable: true,
        writable: true,
      },

      getCanonicalLocales: {
        value: function getCanonicalLocales() {
          throw Error('disabled');
        },
        enumerable: false,
        configurable: true,
        writable: true,
      },
    });
  }
}
