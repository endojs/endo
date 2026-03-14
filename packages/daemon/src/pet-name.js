// @ts-check

/// <reference types="./types.d.ts" />

/** @import { EdgeName, Name, NamePath, PetName, SpecialName } from './types.js' */

import { q } from '@endo/errors';

const validPetNamePattern = /^[a-z0-9][a-z0-9-]{0,127}$/;
const validSpecialNamePattern = /^[A-Z][A-Z0-9-]{0,127}$/;
/** Non-negative integer string, used for MAIL.0, MAIL.1, ... */
const validMailSlotPattern = /^\d+$/;

/**
 * @param {string} petName
 * @returns {petName is PetName}
 */
export const isPetName = petName => validPetNamePattern.test(petName);

/**
 * @param {string} name
 * @returns {name is SpecialName}
 */
export const isSpecialName = name => validSpecialNamePattern.test(name);

/**
 * @param {string} name
 * @returns {name is string} true if valid mail slot (e.g. "0", "1")
 */
export const isMailSlotName = name =>
  typeof name === 'string' && validMailSlotPattern.test(name);

/**
 * @param {string} name
 * @returns {name is Name}
 */
export const isName = name =>
  isPetName(name) || isSpecialName(name) || isMailSlotName(name);

/**
 * @param {string} petName
 * @returns {asserts petName is PetName}
 */
export const assertPetName = petName => {
  if (typeof petName !== 'string' || !isPetName(petName)) {
    throw new Error(`Invalid pet name ${q(petName)}`);
  }
};

/**
 * @param {string} name
 * @returns {asserts name is SpecialName}
 */
export const assertSpecialName = name => {
  if (typeof name !== 'string' || !isSpecialName(name)) {
    throw new Error(`Invalid special name ${q(name)}`);
  }
};

/**
 * @param {string} name
 * @returns {asserts name is Name}
 */
export const assertName = name => {
  if (typeof name !== 'string' || !isName(name)) {
    throw new Error(`Invalid name ${q(name)}`);
  }
};

/**
 * Edge names can be either regular pet names or special names.
 * @param {string} edgeName
 * @returns {asserts edgeName is EdgeName}
 */
export const assertEdgeName = edgeName => {
  if (typeof edgeName !== 'string' || !isName(edgeName)) {
    throw new Error(`Invalid edge name ${q(edgeName)}`);
  }
};

/**
 * @param {string[]} names
 * @returns {asserts names is Name[]}
 */
export const assertNames = names => {
  for (const name of names) {
    assertName(name);
  }
};

/**
 * @param {string[]} petNames
 * @returns {asserts petNames is PetName[]}
 */
export const assertPetNames = petNames => {
  for (const petName of petNames) {
    assertPetName(petName);
  }
};

/**
 * @param {string[]} namePath
 * @returns {asserts namePath is NamePath}
 */
export const assertNamePath = namePath => {
  if (!Array.isArray(namePath) || namePath.length < 1) {
    throw new Error(`Invalid name path`);
  }
  for (const name of namePath) {
    assertName(name);
  }
};

/**
 * Asserts that the path is a valid name path ending in a pet name.
 * Returns the validated path, the prefix path (all but the last element),
 * and the final pet name.
 * @param {string[]} path
 * @returns {{ namePath: NamePath, prefixPath: NamePath, petName: PetName }}
 */
export const assertPetNamePath = path => {
  if (!Array.isArray(path) || path.length < 1) {
    throw new Error(`Invalid name path`);
  }
  const lastIndex = path.length - 1;
  for (let i = 0; i < lastIndex; i += 1) {
    assertName(path[i]);
  }
  const petName = path[lastIndex];
  assertPetName(petName);
  return {
    namePath: /** @type {NamePath} */ (path),
    prefixPath: /** @type {NamePath} */ (path.slice(0, -1)),
    petName,
  };
};

/**
 * Normalizes a name or path to a path and validates it.
 * @param {string | string[]} nameOrPath
 * @returns {NamePath}
 */
export const namePathFrom = nameOrPath => {
  const path = typeof nameOrPath === 'string' ? [nameOrPath] : nameOrPath;
  assertNamePath(path);
  return /** @type {NamePath} */ (path);
};
