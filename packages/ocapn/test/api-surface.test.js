// @ts-check
/**
 * API surface snapshot test using TypeScript compiler API.
 * This test verifies that the public API surface doesn't change unexpectedly
 * and that internal types don't leak through the public API.
 */

import test from '@endo/ses-ava/test.js';
import ts from 'typescript';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const thisFilename = fileURLToPath(import.meta.url);
const thisDirname = dirname(thisFilename);
const packageRoot = join(thisDirname, '..');

/**
 * @typedef {object} TypeMember
 * @property {string} name
 * @property {string[]} referencedTypes
 * @property {boolean} isMethod
 */

/**
 * @typedef {object} TypeDef
 * @property {string} name
 * @property {string} file
 * @property {TypeMember[]} members
 */

/** @type {string[]} */
const ENTRY_POINTS = ['Client'];

/** @type {string[]} */
const INTERNAL_ONLY_TYPES = [
  // 'Session',
  // 'Ocapn',
  // 'SessionManager',
  // 'GrantTracker',
  // 'SturdyRefTracker',
  // 'ReferenceKit',
];

// Built-in types to exclude from referenced types
const BUILT_IN_TYPES = new Set([
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Array',
  'Object',
  'Error',
  'Uint8Array',
  'ArrayBuffer',
  'ArrayBufferLike',
  'SharedArrayBuffer',
  'string',
  'number',
  'boolean',
  'bigint',
  'void',
  'undefined',
  'null',
  'any',
  'unknown',
  'never',
  'Function',
  'Symbol',
  'Record',
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'Parameters',
  'ReturnType',
]);

/**
 * Create a TypeScript program from the package's tsconfig
 * @returns {ts.Program}
 */
function createProgram() {
  const configPath = join(packageRoot, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(`Error reading tsconfig: ${configFile.error.messageText}`);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageRoot,
  );

  return ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
}

/**
 * Extract type names from a type string using regex
 * @param {string} typeString
 * @returns {string[]}
 */
function extractTypeNamesFromString(typeString) {
  const refs = [];
  const matches = typeString.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
  for (const match of matches) {
    if (!BUILT_IN_TYPES.has(match) && !refs.includes(match)) {
      refs.push(match);
    }
  }
  return refs;
}

/**
 * Extract type references from a TypeScript type
 * @param {ts.Type} type
 * @param {ts.TypeChecker} checker
 * @param {Set<string>} [visited]
 * @returns {string[]}
 */
function extractTypeReferences(type, checker, visited = new Set()) {
  const refs = [];
  const typeString = checker.typeToString(type);

  if (visited.has(typeString)) {
    return refs;
  }
  visited.add(typeString);

  const symbol = type.getSymbol() || type.aliasSymbol;
  if (symbol) {
    const name = symbol.getName();
    if (
      !BUILT_IN_TYPES.has(name) &&
      /^[A-Z]/.test(name) &&
      !name.startsWith('__')
    ) {
      refs.push(name);
    }
  }

  refs.push(...extractTypeNamesFromString(typeString));

  if (type.isUnion()) {
    for (const unionType of type.types) {
      refs.push(...extractTypeReferences(unionType, checker, visited));
    }
  }

  if (type.isIntersection()) {
    for (const intersectionType of type.types) {
      refs.push(...extractTypeReferences(intersectionType, checker, visited));
    }
  }

  const typeArgs = /** @type {any} */ (type).typeArguments;
  if (typeArgs) {
    for (const arg of typeArgs) {
      refs.push(...extractTypeReferences(arg, checker, visited));
    }
  }

  return [...new Set(refs)];
}

/**
 * Check if a type represents a function/method
 * @param {ts.Type} type
 * @returns {boolean}
 */
function isMethodType(type) {
  return type.getCallSignatures().length > 0;
}

/**
 * Extract members from a JSDoc typedef tag
 * @param {ts.JSDocTypedefTag} typedefTag
 * @param {ts.TypeChecker} checker
 * @returns {TypeMember[]}
 */
function extractMembersFromJSDocTypedef(typedefTag, checker) {
  /** @type {TypeMember[]} */
  const members = [];

  const typeExpr = typedefTag.typeExpression;
  if (!typeExpr || !ts.isJSDocTypeLiteral(typeExpr)) {
    return members;
  }

  const propertyTags = /** @type {any} */ (typeExpr).jsDocPropertyTags;
  if (!propertyTags) {
    return members;
  }

  for (const propTag of propertyTags) {
    const name = propTag.name.getText();

    // if (name === 'debug' || name.startsWith('_')) {
    //   // eslint-disable-next-line no-continue
    //   continue;
    // }

    let propType = null;
    if (propTag.typeExpression) {
      propType = checker.getTypeFromTypeNode(propTag.typeExpression.type);
    }

    const isMethod = propType ? isMethodType(propType) : false;
    const referencedTypes = [];

    if (propType) {
      if (isMethod) {
        const signatures = propType.getCallSignatures();
        for (const sig of signatures) {
          const returnType = checker.getReturnTypeOfSignature(sig);
          referencedTypes.push(...extractTypeReferences(returnType, checker));
          for (const param of sig.getParameters()) {
            const paramType = checker.getTypeOfSymbol(param);
            referencedTypes.push(...extractTypeReferences(paramType, checker));
          }
        }
      } else {
        referencedTypes.push(...extractTypeReferences(propType, checker));
      }
    }

    members.push({
      name,
      referencedTypes: [...new Set(referencedTypes)],
      isMethod,
    });
  }

  return members;
}

/**
 * Collect all type definitions using TypeScript compiler.
 * Scans all source files in src/ that are part of the TypeScript program.
 * @returns {Map<string, TypeDef>}
 */
function collectTypeDefinitions() {
  const program = createProgram();
  const checker = program.getTypeChecker();

  /** @type {Map<string, TypeDef>} */
  const allTypes = new Map();

  // Get all source files from the program that are in our src/ directory
  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName;

    // Get relative path for storage
    const relativePath = filePath.slice(packageRoot.length + 1);

    const locals = /** @type {any} */ (sourceFile).locals;
    if (locals) {
      locals.forEach((symbol, name) => {
        const declarations = symbol.getDeclarations();
        if (declarations) {
          for (const decl of declarations) {
            if (ts.isJSDocTypedefTag(decl)) {
              const typeName = String(name);
              if (allTypes.has(typeName)) {
                // eslint-disable-next-line no-continue
                continue;
              }
              const members = extractMembersFromJSDocTypedef(decl, checker);
              allTypes.set(typeName, {
                name: typeName,
                file: relativePath,
                members,
              });
            }
          }
        }
      });
    }
  }

  return allTypes;
}

/**
 * Walk type graph starting from entry points
 * @param {Map<string, TypeDef>} allTypes
 * @param {string[]} entryPoints
 * @returns {{reachable: Map<string, {type: TypeDef, path: string[]}>, unreachable: string[]}}
 */
function walkTypeGraph(allTypes, entryPoints) {
  /** @type {Map<string, {type: TypeDef, path: string[]}>} */
  const reachable = new Map();
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {Array<{typeName: string, path: string[]}>} */
  const queue = [];

  for (const entry of entryPoints) {
    queue.push({ typeName: entry, path: [entry] });
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const { typeName, path } = item;
    if (visited.has(typeName)) {
      // eslint-disable-next-line no-continue
      continue;
    }
    visited.add(typeName);

    const typeDef = allTypes.get(typeName);
    if (!typeDef) {
      // eslint-disable-next-line no-continue
      continue;
    }

    reachable.set(typeName, { type: typeDef, path });

    for (const member of typeDef.members) {
      for (const ref of member.referencedTypes) {
        if (!visited.has(ref)) {
          queue.push({
            typeName: ref,
            path: [...path, `${typeName}.${member.name}`, ref],
          });
        }
      }
    }
  }

  const unreachable = [];
  for (const typeName of allTypes.keys()) {
    if (!reachable.has(typeName)) {
      unreachable.push(typeName);
    }
  }

  return { reachable, unreachable };
}

/**
 * Analyze API surface and return structured result
 * @returns {{allTypes: Map<string, TypeDef>, reachable: Map<string, {type: TypeDef, path: string[]}>, leakedTypes: string[], missingInternalTypes: string[]}}
 */
function analyzeApiSurface() {
  const allTypes = collectTypeDefinitions();
  const { reachable } = walkTypeGraph(allTypes, ENTRY_POINTS);
  const leakedTypes = INTERNAL_ONLY_TYPES.filter(t => reachable.has(t));
  const missingInternalTypes = INTERNAL_ONLY_TYPES.filter(
    t => !allTypes.has(t),
  );
  return { allTypes, reachable, leakedTypes, missingInternalTypes };
}

/**
 * Format a type definition for snapshot output
 * @param {TypeDef} typeDef
 * @returns {string}
 */
function formatTypeForSnapshot(typeDef) {
  const lines = [`${typeDef.name}:`];

  const properties = typeDef.members
    .filter(m => !m.isMethod)
    .sort((a, b) => a.name.localeCompare(b.name));
  const methods = typeDef.members
    .filter(m => m.isMethod)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (properties.length > 0) {
    lines.push('  Properties:');
    for (const prop of properties) {
      const refs =
        prop.referencedTypes.length > 0
          ? ` → [${prop.referencedTypes.sort().join(', ')}]`
          : '';
      lines.push(`    - ${prop.name}${refs}`);
    }
  }

  if (methods.length > 0) {
    lines.push('  Methods:');
    for (const method of methods) {
      const refs =
        method.referencedTypes.length > 0
          ? ` → [${method.referencedTypes.sort().join(', ')}]`
          : '';
      lines.push(`    - ${method.name}${refs}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a deterministic snapshot string of the public API surface.
 * @returns {string}
 */
function generateApiSnapshot() {
  const { reachable } = analyzeApiSurface();

  const lines = [];

  lines.push('PUBLIC API SURFACE');
  lines.push('==================');
  lines.push(`Entry points: ${ENTRY_POINTS.join(', ')}`);
  lines.push(`Reachable types: ${reachable.size}`);
  lines.push('');

  const sortedReachable = [...reachable.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  for (const [, { type }] of sortedReachable) {
    lines.push(formatTypeForSnapshot(type));
    lines.push('');
  }

  return lines.join('\n').trim();
}

test('public API surface snapshot', t => {
  const snapshot = generateApiSnapshot();
  t.snapshot(snapshot);
});

test('no internal types leak through public API', t => {
  const { leakedTypes } = analyzeApiSurface();
  t.deepEqual(
    leakedTypes,
    [],
    `Internal types should not be reachable from public API: ${leakedTypes.join(', ')}`,
  );
});

test('INTERNAL_ONLY_TYPES list is up to date', t => {
  const { missingInternalTypes } = analyzeApiSurface();
  t.deepEqual(
    missingInternalTypes,
    [],
    `INTERNAL_ONLY_TYPES contains types that don't exist in codebase: ${missingInternalTypes.join(', ')}`,
  );
});
