/* eslint-disable  */
import { expectType } from 'tsd';
import { type BundleSourceResult } from '../src/types.js';

expectType<BundleSourceResult<'endoZipBase64'>>({
  moduleFormat: 'endoZipBase64',
  endoZipBase64: '',
  endoZipBase64Sha512: '',
});

expectType<BundleSourceResult<'endoZipBase64'>>({
  moduleFormat: 'endoZipBase64',
  endoZipBase64: '',
  endoZipBase64Sha512: '',
});

expectType<BundleSourceResult<'endoZipBase64'>>({
  moduleFormat: 'endoZipBase64',
  endoZipBase64: '',
  // @ts-expect-error must be string
  endoZipBase64Sha512: undefined,
});

// a 'test' bundle is importable but not a BundleSource result
// @ts-expect-error Type '"test"' does not satisfy the constraint 'ModuleFormat'.
type TestBundle = BundleSourceResult<'test'>;
