/* global globalThis */

const symbolForHarden = Symbol.for('harden');

const makeFakeHarden = () => {
  const harden = o => o;
  harden.isFake = true;
  harden.lockdownError = new Error(
    'Cannot lockdown (repairIntrinsics) because @endo/harden used before lockdown on this stack',
  );
  return harden;
};

const selectHarden = () => {
  // Favoring globalThis.harden over Object[@harden] allows the creator or
  // content of a Compartment to elect to use a different harden than the one
  // chosen for the realm, albeit the one chosen by lockdown.
  // Compartments are not generally multi-tenant, so the mutability of
  // globalThis.harden is not a concern.
  // However, compartments may be safely multi-tenant only if they freeze
  // globalThis.
  // So, this gives us the greatest flexibility without compromising integrity.
  // Ignoring the following error because it appears in prepack but not lint.
  // @ts-ignore-error Property 'harden' does not exist on type 'typeof globalThis'.
  const { harden: globalHarden } = globalThis;
  if (globalHarden) {
    if (typeof globalHarden !== 'function') {
      throw new Error('@endo/harden expected callable globalThis.harden');
    }
    return globalHarden;
  }

  // @ts-expect-error Type 'unique symbol' cannot be used as an index type.
  const { [symbolForHarden]: objectHarden } = Object;
  if (objectHarden) {
    if (typeof objectHarden !== 'function') {
      throw new Error('@endo/harden expected callable Object[@harden]');
    }
    return objectHarden;
  }

  const fakeHarden = makeFakeHarden();
  // We should not reach this point if a harden implementation already exists here.
  // The non-configurability of this property will prevent any HardenedJS's
  // lockdown from succeeding.
  // Versions that predate the introduction of Object[@harden] will be unable
  // to remove the unknown intrinsic.
  // Versions that permit Object[@harden] fail explicitly.
  Object.defineProperty(Object, symbolForHarden, {
    value: fakeHarden,
    configurable: false,
    writable: false,
  });
  return fakeHarden;
};

let selectedHarden;

/**
 * @template T
 * @param {T} object
 * @returns {T}
 */
const harden = object => {
  if (!selectedHarden) {
    selectedHarden = selectHarden();
  }
  return selectedHarden(object);
};

export default harden;
