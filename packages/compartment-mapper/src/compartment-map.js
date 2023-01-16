// @ts-check
/// <reference types="ses"/>

// TODO convert to the new `||` assert style.
// Deferred because this file pervasively uses simple template strings rather than
// template strings tagged with `assert.details` (aka `X`), and uses
// this definition of `q` rather than `assert.quote`
const q = JSON.stringify;

const moduleLanguages = [
  'cjs',
  'mjs',
  'json',
  'text',
  'bytes',
  'pre-mjs-json',
  'pre-cjs-json',
];

/** @type {(a: string, b: string) => number} */
// eslint-disable-next-line no-nested-ternary
export const stringCompare = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

/**
 * @param {number} length
 * @param {string} term
 */
const cumulativeLength = (length, term) => {
  return length + term.length;
};

/**
 * @param {Array<string> | undefined} a
 * @param {Array<string> | undefined} b
 */
export const pathCompare = (a, b) => {
  // Undefined is not preferred
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  // Prefer the shortest dependency path.
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  // Otherwise, favor the shortest cumulative length.
  const aSum = a.reduce(cumulativeLength, 0);
  const bSum = b.reduce(cumulativeLength, 0);
  if (aSum !== bSum) {
    return aSum - bSum;
  }
  // Otherwise, compare terms lexically.
  assert(a.length === b.length); // Reminder
  // This loop guarantees that if any pair of terms is different, including the
  // case where one is a prefix of the other, we will return a non-zero value.
  for (let i = 0; i < a.length; i += 1) {
    const comparison = stringCompare(a[i], b[i]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  // If all pairs of terms are the same respective lengths, we are guaranteed
  // that they are exactly the same or one of them is lexically distinct and would
  // have already been caught.
  return 0;
};

/**
 * @template T
 * @param {Iterable<T>} iterable
 */
function* enumerate(iterable) {
  let index = 0;
  for (const value of iterable) {
    yield [index, value];
    index += 1;
  }
}

/**
 * @param {Record<string, unknown>} object
 * @param {string} message
 */
const assertEmptyObject = (object, message) => {
  assert(Object.keys(object).length === 0, message);
};

/**
 * @param {unknown} tags
 * @param {string} url
 */
const assertTags = (tags, url) => {
  if (tags === undefined) return;
  assert(
    Array.isArray(tags),
    `tags must be an array, got ${tags} in ${q(url)}`,
  );
  for (const [index, value] of enumerate(tags)) {
    assert.typeof(
      value,
      'string',
      `tags[${index}] must be a string, got ${value} in ${q(url)}`,
    );
  }
};

/**
 * @param {Record<string, unknown>} allegedModule
 * @param {string} path
 * @param {string} url
 */
const assertCompartmentModule = (allegedModule, path, url) => {
  const { compartment, module, ...extra } = allegedModule;
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q({
      extra,
      compartment,
    })} in ${q(url)}`,
  );
  assert.typeof(
    compartment,
    'string',
    `${path}.compartment must be a string, got ${q(compartment)} in ${q(url)}`,
  );
  assert.typeof(
    module,
    'string',
    `${path}.module must be a string, got ${q(module)} in ${q(url)}`,
  );
};

/**
 * @param {Record<string, unknown>} allegedModule
 * @param {string} path
 * @param {string} url
 */
const assertFileModule = (allegedModule, path, url) => {
  const { location, parser, sha512, ...extra } = allegedModule;
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      Object.keys(extra),
    )} in ${q(url)}`,
  );
  assert.typeof(
    location,
    'string',
    `${path}.location must be a string, got ${q(location)} in ${q(url)}`,
  );
  assert.typeof(
    parser,
    'string',
    `${path}.parser must be a string, got ${q(parser)} in ${q(url)}`,
  );
  assert(
    moduleLanguages.includes(parser),
    `${path}.parser must be one of ${q(moduleLanguages)}, got ${parser} in ${q(
      url,
    )}`,
  );

  if (sha512 !== undefined) {
    assert.typeof(
      sha512,
      'string',
      `${path}.sha512 must be a string, got ${q(sha512)} in ${q(url)}`,
    );
  }
};

/**
 * @param {Record<string, unknown>} allegedModule
 * @param {string} path
 * @param {string} url
 */
const assertExitModule = (allegedModule, path, url) => {
  const { exit, ...extra } = allegedModule;
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      Object.keys(extra),
    )} in ${q(url)}`,
  );
  assert.typeof(
    exit,
    'string',
    `${path}.exit must be a string, got ${q(exit)} in ${q(url)}`,
  );
};

/**
 * @param {unknown} allegedModule
 * @param {string} path
 * @param {string} url
 */
const assertModule = (allegedModule, path, url) => {
  const moduleDescriptor = Object(allegedModule);
  assert(
    allegedModule === moduleDescriptor && !Array.isArray(moduleDescriptor),
    `${path} must be an object, got ${allegedModule} in ${q(url)}`,
  );

  const { compartment, module, location, parser, exit, deferredError } =
    moduleDescriptor;
  if (compartment !== undefined || module !== undefined) {
    assertCompartmentModule(moduleDescriptor, path, url);
  } else if (location !== undefined || parser !== undefined) {
    assertFileModule(moduleDescriptor, path, url);
  } else if (exit !== undefined) {
    assertExitModule(moduleDescriptor, path, url);
  } else if (deferredError !== undefined) {
    assert.typeof(
      deferredError,
      'string',
      `${path}.deferredError must be a string contaiing an error message`,
    );
  } else {
    assert.fail(
      `${path} is not a valid module descriptor, got ${q(allegedModule)} in ${q(
        url,
      )}`,
    );
  }
};

/**
 * @param {unknown} allegedModules
 * @param {string} path
 * @param {string} url
 */
const assertModules = (allegedModules, path, url) => {
  const modules = Object(allegedModules);
  assert(
    allegedModules === modules || !Array.isArray(modules),
    `modules must be an object, got ${q(allegedModules)} in ${q(url)}`,
  );
  for (const [key, value] of Object.entries(modules)) {
    assertModule(value, `${path}.modules[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedParsers
 * @param {string} path
 * @param {string} url
 */
const assertParsers = (allegedParsers, path, url) => {
  if (allegedParsers === undefined) {
    return;
  }
  const parsers = Object(allegedParsers);
  assert(
    allegedParsers === parsers && !Array.isArray(parsers),
    `${path}.parsers must be an object, got ${allegedParsers} in ${q(url)}`,
  );

  for (const [key, value] of Object.entries(parsers)) {
    assert.typeof(
      key,
      'string',
      `all keys of ${path}.parsers must be strings, got ${key} in ${q(url)}`,
    );
    assert.typeof(
      value,
      'string',
      `${path}.parsers[${q(key)}] must be a string, got ${value} in ${q(url)}`,
    );
    assert(
      moduleLanguages.includes(value),
      `${path}.parsers[${q(key)}] must be one of ${q(
        moduleLanguages,
      )}, got ${value} in ${q(url)}`,
    );
  }
};

/**
 * @param {unknown} allegedScope
 * @param {string} path
 * @param {string} url
 */
const assertScope = (allegedScope, path, url) => {
  const scope = Object(allegedScope);
  assert(
    allegedScope === scope && !Array.isArray(scope),
    `${path} must be an object, got ${allegedScope} in ${q(url)}`,
  );

  const { compartment, ...extra } = scope;
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      Object.keys(extra),
    )} in ${q(url)}`,
  );

  assert.typeof(
    compartment,
    'string',
    `${path}.compartment must be a string, got ${q(compartment)} in ${q(url)}`,
  );
};

/**
 * @param {unknown} allegedScopes
 * @param {string} path
 * @param {string} url
 */
const assertScopes = (allegedScopes, path, url) => {
  if (allegedScopes === undefined) {
    return;
  }
  const scopes = Object(allegedScopes);
  assert(
    allegedScopes === scopes && !Array.isArray(scopes),
    `${path}.scopes must be an object, got ${q(allegedScopes)} in ${q(url)}`,
  );

  for (const [key, value] of Object.entries(scopes)) {
    assert.typeof(
      key,
      'string',
      `all keys of ${path}.scopes must be strings, got ${key} in ${q(url)}`,
    );
    assertScope(value, `${path}.scopes[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedTypes
 * @param {string} path
 * @param {string} url
 */
const assertTypes = (allegedTypes, path, url) => {
  if (allegedTypes === undefined) {
    return;
  }
  const types = Object(allegedTypes);
  assert(
    allegedTypes === types && !Array.isArray(types),
    `${path}.types must be an object, got ${allegedTypes} in ${q(url)}`,
  );

  for (const [key, value] of Object.entries(types)) {
    assert.typeof(
      key,
      'string',
      `all keys of ${path}.types must be strings, got ${key} in ${q(url)}`,
    );
    assert.typeof(
      value,
      'string',
      `${path}.types[${q(key)}] must be a string, got ${value} in ${q(url)}`,
    );
    assert(
      moduleLanguages.includes(value),
      `${path}.types[${q(key)}] must be one of ${q(
        moduleLanguages,
      )}, got ${value} in ${q(url)}`,
    );
  }
};

/**
 * @param {unknown} allegedPolicy
 * @param {string} path
 * @param {string} [url]
 */

const assertPolicy = (
  allegedPolicy,
  path,
  url = '<unknown-compartment-map.json>',
) => {
  const policy = Object(allegedPolicy);
  assert(
    allegedPolicy === undefined ||
      (allegedPolicy === policy && !Array.isArray(policy)),
    `${path}.policy must be undefined or an object, got ${allegedPolicy} in ${q(
      url,
    )}`,
  );
};

/**
 * @param {unknown} allegedCompartment
 * @param {string} path
 * @param {string} url
 */
const assertCompartment = (allegedCompartment, path, url) => {
  const compartment = Object(allegedCompartment);
  assert(
    allegedCompartment === compartment && !Array.isArray(compartment),
    `${path} must be an object, got ${allegedCompartment} in ${q(url)}`,
  );

  const {
    location,
    name,
    label,
    parsers,
    types,
    scopes,
    modules,
    policy,
    ...extra
  } = compartment;

  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      Object.keys(extra),
    )} in ${q(url)}`,
  );

  assert.typeof(
    location,
    'string',
    `${path}.location in ${q(url)} must be string, got ${q(location)}`,
  );
  assert.typeof(
    name,
    'string',
    `${path}.name in ${q(url)} must be string, got ${q(name)}`,
  );
  assert.typeof(
    label,
    'string',
    `${path}.label in ${q(url)} must be string, got ${q(label)}`,
  );

  assertModules(modules, path, url);
  assertParsers(parsers, path, url);
  assertScopes(scopes, path, url);
  assertTypes(types, path, url);
  assertPolicy(policy, path, url);
};

/**
 * @param {unknown} allegedCompartments
 * @param {string} url
 */
const assertCompartments = (allegedCompartments, url) => {
  const compartments = Object(allegedCompartments);
  assert(
    allegedCompartments === compartments || !Array.isArray(compartments),
    `compartments must be an object, got ${q(allegedCompartments)} in ${q(
      url,
    )}`,
  );
  for (const [key, value] of Object.entries(compartments)) {
    assertCompartment(value, `compartments[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedEntry
 * @param {string} url
 */
const assertEntry = (allegedEntry, url) => {
  const entry = Object(allegedEntry);
  assert(
    allegedEntry === entry && !Array.isArray(entry),
    `"entry" must be an object in compartment map, got ${allegedEntry} in ${q(
      url,
    )}`,
  );
  const { compartment, module, ...extra } = entry;
  assertEmptyObject(
    extra,
    `"entry" must not have extra properties in compartment map, got ${q(
      Object.keys(extra),
    )} in ${q(url)}`,
  );
  assert.typeof(
    compartment,
    'string',
    `entry.compartment must be a string in compartment map, got ${compartment} in ${q(
      url,
    )}`,
  );
  assert.typeof(
    module,
    'string',
    `entry.module must be a string in compartment map, got ${module} in ${q(
      url,
    )}`,
  );
};

/**
 * @param {unknown} allegedCompartmentMap
 * @param {string} [url]
 * @returns {asserts compartmentMap is import('./types.js').CompartmentMapDescriptor}
 */

export const assertCompartmentMap = (
  allegedCompartmentMap,
  url = '<unknown-compartment-map.json>',
) => {
  const compartmentMap = Object(allegedCompartmentMap);
  assert(
    allegedCompartmentMap === compartmentMap && !Array.isArray(compartmentMap),
    `Compartment map must be an object, got ${allegedCompartmentMap} in ${q(
      url,
    )}`,
  );
  const { tags, entry, compartments, ...extra } = Object(compartmentMap);
  assertEmptyObject(
    extra,
    `Compartment map must not have extra properties, got ${q(
      Object.keys(extra),
    )} in ${q(url)}`,
  );
  assertTags(tags, url);
  assertEntry(entry, url);
  assertCompartments(compartments, url);
};
