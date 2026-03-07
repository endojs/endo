// @ts-check

// Trusted shim: enable instance-level override of AsyncGenerator.prototype.return.
//
// SES lockdown with overrideTaming:'moderate' only allows overriding a
// whitelist of prototype properties on instances. AsyncGenerator.prototype.return
// is not in that whitelist, but @chainsafe/libp2p-yamux's `returnlessSource`
// assigns `iterator.return = undefined` on AsyncGenerator instances.
//
// This shim must run between repairIntrinsics() and hardenIntrinsics().
// It replaces the `.return` data property with a getter/setter pair that
// allows per-instance shadowing — the same pattern SES uses internally
// for the override-mistake fix.

const AsyncGeneratorPrototype = Object.getPrototypeOf(
  // eslint-disable-next-line no-empty-function
  async function* () {}.prototype,
);

const desc = Object.getOwnPropertyDescriptor(AsyncGeneratorPrototype, 'return');

if (desc && 'value' in desc && desc.configurable) {
  const { value } = desc;

  const { get: getter, set: setter } =
    /** @type {{ get: () => any, set: (v: any) => void }} */ (
      Object.getOwnPropertyDescriptor(
        {
          get return() {
            return value;
          },
          set return(newValue) {
            if (AsyncGeneratorPrototype === this) {
              throw TypeError(
                "Cannot assign to read only property 'return' of 'AsyncGeneratorPrototype'",
              );
            }
            if (Object.prototype.hasOwnProperty.call(this, 'return')) {
              this.return = newValue;
            } else {
              Object.defineProperty(this, 'return', {
                value: newValue,
                writable: true,
                enumerable: true,
                configurable: true,
              });
            }
          },
        },
        'return',
      )
    );

  Object.defineProperty(getter, 'originalValue', {
    value,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  Object.defineProperty(AsyncGeneratorPrototype, 'return', {
    get: getter,
    set: setter,
    enumerable: desc.enumerable,
    configurable: desc.configurable,
  });
}
