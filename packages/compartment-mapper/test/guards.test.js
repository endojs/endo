import test from 'ava';
import {
  isErrorModuleConfiguration,
  isFileModuleConfiguration,
  isExitModuleConfiguration,
  isCompartmentModuleConfiguration,
  isErrorModuleSource,
  isExitModuleSource,
  isLocalModuleSource,
  isNonNullableObject,
} from '../src/guards.js';

test('guard - isErrorModuleConfiguration() - returns true for object with deferredError', t => {
  t.true(isErrorModuleConfiguration({ deferredError: 'some error' }));
});

test('guard - isErrorModuleConfiguration() - returns false for object without deferredError', t => {
  t.false(isErrorModuleConfiguration({ parser: 'mjs' }));
});

test('guard - isErrorModuleConfiguration() - returns false when deferredError is undefined', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isErrorModuleConfiguration({ deferredError: undefined }));
});

test('guard - isErrorModuleConfiguration() - returns false for empty object', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isErrorModuleConfiguration({}));
});

test('guard - isFileModuleConfiguration() - returns true for object with parser', t => {
  t.true(isFileModuleConfiguration({ parser: 'mjs' }));
});

test('guard - isFileModuleConfiguration() - returns true for object with parser and location', t => {
  t.true(
    isFileModuleConfiguration({
      parser: 'cjs',
      location: './module.js',
    }),
  );
});

test('guard - isFileModuleConfiguration() - returns false for object without parser', t => {
  t.false(isFileModuleConfiguration({ exit: 'node:fs' }));
});

test('guard - isFileModuleConfiguration() - returns false when parser is undefined', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isFileModuleConfiguration({ parser: undefined }));
});

test('guard - isFileModuleConfiguration() - returns false when deferredError is present', t => {
  t.false(
    isFileModuleConfiguration({
      parser: 'mjs',
      deferredError: 'some error',
    }),
  );
});

test('guard - isFileModuleConfiguration() - returns false for empty object', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isFileModuleConfiguration({}));
});

test('guard - isExitModuleConfiguration() - returns true for object with exit', t => {
  t.true(isExitModuleConfiguration({ exit: 'node:fs' }));
});

test('guard - isExitModuleConfiguration() - returns false for object without exit', t => {
  t.false(isExitModuleConfiguration({ parser: 'mjs' }));
});

test('guard - isExitModuleConfiguration() - returns false when exit is undefined', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isExitModuleConfiguration({ exit: undefined }));
});

test('guard - isExitModuleConfiguration() - returns false when deferredError is present', t => {
  t.false(
    isExitModuleConfiguration({
      exit: 'node:fs',
      deferredError: 'some error',
    }),
  );
});

test('guard - isExitModuleConfiguration() - returns false for empty object', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isExitModuleConfiguration({}));
});

test('guard - isCompartmentModuleConfiguration() - returns true for object with compartment and module', t => {
  t.true(
    isCompartmentModuleConfiguration({
      compartment: 'file:///some/compartment',
      module: 'index.js',
    }),
  );
});

test('guard - isCompartmentModuleConfiguration() - returns false for object with only compartment', t => {
  t.false(
    // @ts-expect-error intentionally invalid input
    isCompartmentModuleConfiguration({
      compartment: 'file:///some/compartment',
    }),
  );
});

test('guard - isCompartmentModuleConfiguration() - returns false for object with only module', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isCompartmentModuleConfiguration({ module: 'index.js' }));
});

test('guard - isCompartmentModuleConfiguration() - returns false when compartment is undefined', t => {
  t.false(
    isCompartmentModuleConfiguration({
      // @ts-expect-error intentionally invalid input
      compartment: undefined,
      module: 'index.js',
    }),
  );
});

test('guard - isCompartmentModuleConfiguration() - returns false when module is undefined', t => {
  t.false(
    isCompartmentModuleConfiguration({
      compartment: 'file:///some/compartment',
      // @ts-expect-error intentionally invalid input
      module: undefined,
    }),
  );
});

test('guard - isCompartmentModuleConfiguration() - returns false when deferredError is present', t => {
  t.false(
    isCompartmentModuleConfiguration({
      compartment: 'file:///some/compartment',
      module: 'index.js',
      deferredError: 'some error',
    }),
  );
});

test('guard - isCompartmentModuleConfiguration() - returns false for empty object', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isCompartmentModuleConfiguration({}));
});

test('guard - isErrorModuleSource() - returns true for object with deferredError', t => {
  t.true(isErrorModuleSource({ deferredError: 'some error' }));
});

test('guard - isErrorModuleSource() - returns false for object without deferredError', t => {
  t.false(isErrorModuleSource({ exit: 'node:fs' }));
});

test('guard - isErrorModuleSource() - returns false when deferredError is undefined', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isErrorModuleSource({ deferredError: undefined }));
});

test('guard - isErrorModuleSource() - returns false for empty object', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isErrorModuleSource({}));
});

test('guard - isExitModuleSource() - returns true for object with exit', t => {
  t.true(isExitModuleSource({ exit: 'node:fs' }));
});

test('guard - isExitModuleSource() - returns false for object without exit', t => {
  t.false(
    // @ts-expect-error intentionally invalid input
    isExitModuleSource({
      bytes: new Uint8Array(),
      parser: 'mjs',
      sourceDirname: '/src',
      location: './module.js',
    }),
  );
});

test('guard - isExitModuleSource() - returns false when exit is undefined', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isExitModuleSource({ exit: undefined }));
});

test('guard - isExitModuleSource() - returns false when deferredError is present', t => {
  t.false(
    isExitModuleSource({
      exit: 'node:fs',
      deferredError: 'some error',
    }),
  );
});

test('guard - isExitModuleSource() - returns false for empty object', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isExitModuleSource({}));
});

test('guard - isLocalModuleSource() - returns true for object with all required properties', t => {
  t.true(
    // @ts-expect-error intentionally incomplete input (missing sourceLocation, record)
    isLocalModuleSource({
      bytes: new Uint8Array([0x01, 0x02]),
      parser: 'mjs',
      sourceDirname: '/src',
      location: './module.js',
    }),
  );
});

test('guard - isLocalModuleSource() - returns false when bytes is missing', t => {
  t.false(
    // @ts-expect-error intentionally invalid input
    isLocalModuleSource({
      parser: 'mjs',
      sourceDirname: '/src',
      location: './module.js',
    }),
  );
});

test('guard - isLocalModuleSource() - returns false when parser is missing', t => {
  t.false(
    // @ts-expect-error intentionally invalid input
    isLocalModuleSource({
      bytes: new Uint8Array(),
      sourceDirname: '/src',
      location: './module.js',
    }),
  );
});

test('guard - isLocalModuleSource() - returns false when sourceDirname is missing', t => {
  t.false(
    // @ts-expect-error intentionally invalid input
    isLocalModuleSource({
      bytes: new Uint8Array(),
      parser: 'mjs',
      location: './module.js',
    }),
  );
});

test('guard - isLocalModuleSource() - returns false when location is missing', t => {
  t.false(
    // @ts-expect-error intentionally invalid input
    isLocalModuleSource({
      bytes: new Uint8Array(),
      parser: 'mjs',
      sourceDirname: '/src',
    }),
  );
});

test('guard - isLocalModuleSource() - returns false when any required property is undefined', t => {
  t.plan(4);
  t.false(
    isLocalModuleSource({
      // @ts-expect-error intentionally invalid input
      bytes: undefined,
      parser: 'mjs',
      sourceDirname: '/src',
      location: './module.js',
    }),
  );
  t.false(
    isLocalModuleSource({
      bytes: new Uint8Array(),
      // @ts-expect-error intentionally invalid input
      parser: undefined,
      sourceDirname: '/src',
      location: './module.js',
    }),
  );
  t.false(
    isLocalModuleSource({
      bytes: new Uint8Array(),
      parser: 'mjs',
      // @ts-expect-error intentionally invalid input
      sourceDirname: undefined,
      location: './module.js',
    }),
  );
  t.false(
    isLocalModuleSource({
      bytes: new Uint8Array(),
      parser: 'mjs',
      sourceDirname: '/src',
      // @ts-expect-error intentionally invalid input
      location: undefined,
    }),
  );
});

test('guard - isLocalModuleSource() - returns false when deferredError is present', t => {
  t.false(
    isLocalModuleSource({
      bytes: new Uint8Array(),
      parser: 'mjs',
      sourceDirname: '/src',
      location: './module.js',
      deferredError: 'some error',
    }),
  );
});

test('guard - isLocalModuleSource() - returns false for empty object', t => {
  // @ts-expect-error intentionally invalid input
  t.false(isLocalModuleSource({}));
});

test('guard - isNonNullableObject() - returns true for plain object', t => {
  t.true(isNonNullableObject({}));
});

test('guard - isNonNullableObject() - returns true for object with properties', t => {
  t.true(isNonNullableObject({ foo: 'bar' }));
});

test('guard - isNonNullableObject() - returns true for array', t => {
  t.true(isNonNullableObject([]));
});

test('guard - isNonNullableObject() - returns true for Date', t => {
  t.true(isNonNullableObject(new Date()));
});

test('guard - isNonNullableObject() - returns false for null', t => {
  t.false(isNonNullableObject(null));
});

test('guard - isNonNullableObject() - returns false for undefined', t => {
  t.false(isNonNullableObject(undefined));
});

test('guard - isNonNullableObject() - returns false for primitive values', t => {
  t.plan(5);
  t.false(isNonNullableObject('string'));
  t.false(isNonNullableObject(42));
  t.false(isNonNullableObject(true));
  t.false(isNonNullableObject(Symbol('test')));
  t.false(isNonNullableObject(BigInt(123)));
});
