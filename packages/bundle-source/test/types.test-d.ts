/* eslint-disable  */
import { expectTypeOf } from 'expect-type';
import { type BundleSourceResult } from '../src/types.js';

expectTypeOf({
  moduleFormat: 'endoZipBase64' as const,
  endoZipBase64: '',
  endoZipBase64Sha512: '',
}).toEqualTypeOf<BundleSourceResult<'endoZipBase64'>>();

expectTypeOf({
  moduleFormat: 'endoZipBase64' as const,
  endoZipBase64: '',
  endoZipBase64Sha512: '',
}).toEqualTypeOf<BundleSourceResult<'endoZipBase64'>>();

expectTypeOf({
  moduleFormat: 'endoZipBase64' as const,
  endoZipBase64: '',
  endoZipBase64Sha512: undefined,
})
  // @ts-expect-error must be string
  .toEqualTypeOf<BundleSourceResult<'endoZipBase64'>>();

// a 'test' bundle is importable but not a BundleSource result
// @ts-expect-error Type '"test"' does not satisfy the constraint 'ModuleFormat'.
type TestBundle = BundleSourceResult<'test'>;
