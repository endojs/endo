import test from '@endo/ses-ava/prepare-endo.js';

import {
  isValidName,
  isPetName,
  isSpecialName,
  isName,
  assertPetName,
  assertSpecialName,
  assertName,
  assertEdgeName,
  assertNames,
  assertPetNames,
  assertNamePath,
  assertPetNamePath,
  namePathFrom,
} from '../src/pet-name.js';

// --- isValidName ---

test('isValidName accepts simple names', t => {
  t.true(isValidName('hello'));
  t.true(isValidName('my-project'));
  t.true(isValidName('a'));
});

test('isValidName rejects empty string', t => {
  t.false(isValidName(''));
});

test('isValidName rejects names with slash', t => {
  t.false(isValidName('a/b'));
});

test('isValidName rejects names with null byte', t => {
  t.false(isValidName('a\0b'));
});

test('isValidName rejects names with @', t => {
  t.false(isValidName('@host'));
});

test('isValidName rejects . and ..', t => {
  t.false(isValidName('.'));
  t.false(isValidName('..'));
});

test('isValidName rejects names over 255 chars', t => {
  t.false(isValidName('a'.repeat(256)));
  t.true(isValidName('a'.repeat(255)));
});

test('isValidName rejects non-string', t => {
  t.false(isValidName(/** @type {any} */ (42)));
  t.false(isValidName(/** @type {any} */ (undefined)));
});

// --- isPetName / isSpecialName / isName ---

test('isPetName is alias for isValidName', t => {
  t.true(isPetName('hello'));
  t.false(isPetName('@special'));
});

test('isSpecialName accepts valid special names', t => {
  t.true(isSpecialName('@self'));
  t.true(isSpecialName('@host'));
  t.true(isSpecialName('@agent'));
  t.true(isSpecialName('@mail'));
});

test('isSpecialName rejects invalid patterns', t => {
  t.false(isSpecialName('notspecial'));
  t.false(isSpecialName('@'));
  t.false(isSpecialName('@A'));
  t.false(isSpecialName('@1start'));
});

test('isName accepts both pet names and special names', t => {
  t.true(isName('hello'));
  t.true(isName('@self'));
  t.false(isName(''));
  t.false(isName('/'));
});

// --- assert functions ---

test('assertPetName accepts valid pet name', t => {
  t.notThrows(() => assertPetName('my-thing'));
});

test('assertPetName rejects invalid', t => {
  t.throws(() => assertPetName('@special'), { message: /Invalid pet name/ });
  t.throws(() => assertPetName(''), { message: /Invalid pet name/ });
});

test('assertSpecialName accepts valid', t => {
  t.notThrows(() => assertSpecialName('@self'));
});

test('assertSpecialName rejects invalid', t => {
  t.throws(() => assertSpecialName('notspecial'), {
    message: /Invalid special name/,
  });
});

test('assertName accepts both types', t => {
  t.notThrows(() => assertName('hello'));
  t.notThrows(() => assertName('@self'));
});

test('assertName rejects invalid', t => {
  t.throws(() => assertName(''), { message: /Invalid name/ });
  t.throws(() => assertName('/path'), { message: /Invalid name/ });
});

test('assertEdgeName accepts both types', t => {
  t.notThrows(() => assertEdgeName('hello'));
  t.notThrows(() => assertEdgeName('@self'));
});

test('assertEdgeName rejects invalid', t => {
  t.throws(() => assertEdgeName(''), { message: /Invalid edge name/ });
});

test('assertNames validates array of names', t => {
  t.notThrows(() => assertNames(['a', 'b', '@self']));
  t.throws(() => assertNames(['a', '']), { message: /Invalid name/ });
});

test('assertPetNames validates array of pet names', t => {
  t.notThrows(() => assertPetNames(['a', 'b']));
  t.throws(() => assertPetNames(['@self']), { message: /Invalid pet name/ });
});

// --- assertNamePath ---

test('assertNamePath accepts valid path', t => {
  t.notThrows(() => assertNamePath(['a']));
  t.notThrows(() => assertNamePath(['a', 'b', 'c']));
  t.notThrows(() => assertNamePath(['@self', 'child']));
});

test('assertNamePath rejects empty array', t => {
  t.throws(() => assertNamePath([]), { message: /Invalid name path/ });
});

test('assertNamePath rejects non-array', t => {
  t.throws(() => assertNamePath(/** @type {any} */ ('not-array')), {
    message: /Invalid name path/,
  });
});

// --- assertPetNamePath ---

test('assertPetNamePath returns structured result', t => {
  const result = assertPetNamePath(['a', 'b', 'c']);
  t.deepEqual(result.namePath, ['a', 'b', 'c']);
  t.deepEqual(result.prefixPath, ['a', 'b']);
  t.is(result.petName, 'c');
});

test('assertPetNamePath single element', t => {
  const result = assertPetNamePath(['x']);
  t.deepEqual(result.namePath, ['x']);
  t.deepEqual(result.prefixPath, []);
  t.is(result.petName, 'x');
});

test('assertPetNamePath rejects non-array', t => {
  t.throws(() => assertPetNamePath(/** @type {any} */ ('not-array')), {
    message: /Invalid name path/,
  });
});

test('assertPetNamePath rejects empty array', t => {
  t.throws(() => assertPetNamePath([]), { message: /Invalid name path/ });
});

test('assertPetNamePath rejects special name at end', t => {
  t.throws(() => assertPetNamePath(['@self']), {
    message: /Invalid pet name/,
  });
});

test('assertPetNamePath allows special name in prefix', t => {
  const result = assertPetNamePath(['@self', 'child']);
  t.is(result.petName, 'child');
});

// --- namePathFrom ---

test('namePathFrom normalizes string to array', t => {
  const result = namePathFrom('hello');
  t.deepEqual(result, ['hello']);
});

test('namePathFrom passes through array', t => {
  const result = namePathFrom(['a', 'b']);
  t.deepEqual(result, ['a', 'b']);
});

test('namePathFrom validates', t => {
  t.throws(() => namePathFrom(''), { message: /Invalid/ });
  t.throws(() => namePathFrom([]), { message: /Invalid/ });
});
