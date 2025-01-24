/* global globalThis */
import { getEnvironmentOption } from '@endo/env-options';
import { ReflectPlus, ObjectPlus, ProxyPlus } from './src/non-trapping-pony.js';

const nonTrappingShimOption = getEnvironmentOption(
  'SES_NON_TRAPPING_SHIM',
  'disabled',
  ['enabled'],
);

if (nonTrappingShimOption === 'enabled') {
  // TODO figure this out, either remove directive or change to
  // at-ts-expect-error.
  // @ts-ignore type of ReflectPlus vs Reflect, I think
  globalThis.Reflect = ReflectPlus;

  globalThis.Object = ObjectPlus;
  // eslint-disable-next-line no-extend-native
  Object.prototype.constructor = ObjectPlus;

  globalThis.Proxy = ProxyPlus;
}
