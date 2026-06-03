import {
  freeze,
  getOwnPropertyDescriptors,
  create,
  objectPrototype,
  getPrototypeOf,
  ownKeys,
  fromEntries,
  TypeError,
  arrayPush,
  Temporal, // may be undefined on old JS engines
} from './commons.js';

import { permitted } from './permits.js';

/**
 * Tame the `Temporal` namespace object.
 *
 * The `%InitialTemporal%` is indeed the original `Temporal` namespace
 * object, to remain present on the start compartment.
 *
 * The `%SharedTemporal%` is the safe shared `Temporal` namespace object,
 * to be endowed by default on the gloabl of all constructed compartments.
 * This differs only by the omission of `Temporal.Now`, which is the source of
 * the dynamic non-determinism of the ever-changing current time, and the
 * glacial dynamic non-determinism of current timezone and UTC offset (daylight
 * savings time).
 *
 * The remaining source of glacial dynamic non-determinism is locale
 * sensitivity, which `Temporal` provides only via `toLocaleString` methods.
 * This is handled by `tame-locale-methods.js` in the same way as all other
 * `*Locale*` methods.
 *
 * `tameTemporalObject` is modeletd on `tameMathObject` and `tameDateConstructor`
 */
const tameTemporalObject = () => {
  if (Temporal === undefined) {
    return {};
  }

  if (typeof Temporal !== 'object') {
    throw new TypeError(`unexpected typeof Temporal: ${typeof Temporal}`);
  }
  if (getPrototypeOf(Temporal) !== objectPrototype) {
    throw new TypeError(
      `unexpected Temporal __proto__: ${getPrototypeOf(Temporal)}`,
    );
  }

  const initialTemporal = Temporal;
  const { Now: _, ...otherDescriptors } =
    getOwnPropertyDescriptors(initialTemporal);
  const sharedTemporal = create(objectPrototype, otherDescriptors);

  const initialTemporalPermit = permitted['%InitialTemporal%'];
  const intrinsicEntries = [];
  for (const topName of ownKeys(Temporal)) {
    const topPermitName = initialTemporalPermit[topName];
    const topPermit = permitted[topPermitName];
    if (typeof topPermit === 'object') {
      const topVal = initialTemporal[topName];
      arrayPush(intrinsicEntries, [topPermitName, topVal]);
    }
  }

  const result = {
    ...fromEntries(intrinsicEntries),
    '%InitialTemporal%': initialTemporal,
    '%SharedTemporal%': sharedTemporal,
  };
  return result;
};
freeze(tameTemporalObject);

export default tameTemporalObject;
