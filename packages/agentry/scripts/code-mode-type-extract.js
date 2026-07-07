// @ts-check
/// <reference types="ses"/>

/**
 * Generic, exo-agnostic code-mode type machinery: the shared intermediate
 * representation ({@link GlobalTypeIR}) plus BOTH renderers that fill it from a
 * source and the one renderer that prints it.
 *
 * This module is NOT part of the `@endo/agentry` runtime graph: it depends on
 * the `typescript` compiler API and the `@endo/patterns` guard payload helpers,
 * both dev-only. The per-exo extractors (`code-mode-git-extract.js`,
 * `code-mode-fs-extract.js`) compose these primitives with their own
 * source configuration; `scripts/gen-code-mode-types.js` composes the per-exo
 * extractors to write the checked-in runtime artifacts, and the divergence gate
 * in `test/code-mode-types.test.js` re-runs them to keep those artifacts fresh.
 *
 * Two renderers fill the IR from two different kinds of source; the module
 * exports both and picks no canonical one:
 *
 * - {@link extractTsModuleIR} reads a hand-written `.d.ts` and prints the named
 *   root type with the `typescript` compiler API. Full-fidelity TypeScript is
 *   the richest source when one exists (named parameters, prose-free signatures
 *   straight from the author).
 * - {@link extractGuardIR} walks the runtime `M.interface` guards of a remotable
 *   and the transitive closure of remotables they reach. This is the richest
 *   source when no expressive `.d.ts` exists (a stub, or a generated one).
 *
 * Neither is canonical: `M.interface` guards are lossy as a type source
 * (positional patterns with no parameter names, no JSDoc or prose context), so
 * the TypeScript path stays valuable; a stub `.d.ts` makes the guard path the
 * only useful one. A consumer composes whichever fits each exo.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import {
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { getTag, passStyleOf } from '@endo/pass-style';

/**
 * @typedef {object} TypeMember
 * @property {string} name Member (method) name.
 * @property {string} signature TS type of the member, e.g. `() => Promise<string>`.
 *
 * @typedef {object} AuxType
 * @property {string} name Type name (may be generic, e.g. `ERef<T>`).
 * @property {string} text Right-hand side of the `type <name> = <text>` alias.
 *
 * @typedef {object} GlobalTypeIR
 * @property {string} rootName Name of the global's root object type, e.g. `EndoGit`.
 * @property {TypeMember[]} members Members of the root object type.
 * @property {AuxType[]} auxTypes Supporting named types the members reference
 *   (excluding the root type itself, which the renderer synthesizes from
 *   `members` so a read-only member filter cannot leak the full surface back in
 *   through a self-referential return).
 */

// #region shared renderer (no typescript / patterns dependency)

/**
 * @param {TypeMember[]} members
 * @returns {string}
 */
const renderObjectType = members =>
  `{\n${members.map(m => `  ${m.name}: ${m.signature};`).join('\n')}\n}`;

/**
 * @param {AuxType[]} auxTypes
 * @returns {string}
 */
const renderAuxTypes = auxTypes =>
  auxTypes.map(a => `type ${a.name} = ${a.text};`).join('\n');

/**
 * The single renderer applied to every IR regardless of source: synthesize the
 * root `type` from `members`, print it alongside the supporting aliases as
 * `aux`, and reference it by name as the `body` spliced after
 * `declare const <name>:`.
 *
 * @param {GlobalTypeIR} ir
 * @returns {{ aux: string, body: string }}
 */
export const renderDeclaration = ir =>
  harden({
    aux: renderAuxTypes([
      { name: ir.rootName, text: renderObjectType(ir.members) },
      ...ir.auxTypes,
    ]),
    body: ir.rootName,
  });
harden(renderDeclaration);

// #endregion

// #region TypeScript renderer (`type` -> declaration, via the typescript printer)

/**
 * @param {string} fileName
 * @param {string} text
 * @returns {{ sourceFile: ts.SourceFile, aliasMap: Map<string, ts.TypeAliasDeclaration> }}
 */
const parseTypeAliases = (fileName, text) => {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  /** @type {Map<string, ts.TypeAliasDeclaration>} */
  const aliasMap = new Map();
  for (const stmt of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(stmt)) {
      aliasMap.set(stmt.name.text, stmt);
    }
  }
  return { sourceFile, aliasMap };
};

/**
 * @param {URL} dtsUrl
 * @param {string} moduleName
 * @returns {{ sourceFile: ts.SourceFile, aliasMap: Map<string, ts.TypeAliasDeclaration> }}
 */
const parseDtsModule = (dtsUrl, moduleName) => {
  const text = readFileSync(fileURLToPath(dtsUrl), 'utf8');
  const sourceFile = ts.createSourceFile(
    fileURLToPath(dtsUrl),
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  /** @type {ts.ModuleBlock | undefined} */
  let moduleBody;
  for (const stmt of sourceFile.statements) {
    if (
      ts.isModuleDeclaration(stmt) &&
      ts.isStringLiteral(stmt.name) &&
      stmt.name.text === moduleName &&
      stmt.body &&
      ts.isModuleBlock(stmt.body)
    ) {
      moduleBody = stmt.body;
      break;
    }
  }
  if (!moduleBody) {
    throw new Error(`could not find declare module '${moduleName}'`);
  }
  /** @type {Map<string, ts.TypeAliasDeclaration>} */
  const aliasMap = new Map();
  for (const stmt of moduleBody.statements) {
    if (ts.isTypeAliasDeclaration(stmt)) {
      aliasMap.set(stmt.name.text, stmt);
    }
  }
  return { sourceFile, aliasMap };
};

/**
 * Build a {@link GlobalTypeIR} by locating the named root `type` alias in a
 * parsed TypeScript declaration source, then printing the kept members and the
 * supporting aliases they reach with the `typescript` printer.
 *
 * With a `memberFilter`, only the named members (and the types they reach) are
 * kept; this is how a read-only or otherwise narrowed variant is produced from
 * the same source.
 *
 * @param {object} config
 * @param {ts.SourceFile} config.sourceFile
 * @param {Map<string, ts.TypeAliasDeclaration>} config.aliasMap
 * @param {string} config.rootType Name of the root `type` alias to print.
 * @param {string[]} [config.memberFilter] When set, keep only these members.
 * @returns {GlobalTypeIR}
 */
const extractTsAliasesIR = ({
  sourceFile,
  aliasMap,
  rootType,
  memberFilter,
}) => {
  const printer = ts.createPrinter({ removeComments: true });
  const rootAlias = aliasMap.get(rootType);
  if (!rootAlias || !ts.isTypeLiteralNode(rootAlias.type)) {
    throw new Error(`${rootType} is not a type literal`);
  }
  const keep = name => !memberFilter || memberFilter.includes(name);

  /** @type {TypeMember[]} */
  const members = [];
  /** @type {ts.TypeNode[]} */
  const keptTypeNodes = [];
  for (const m of rootAlias.type.members) {
    if (
      ts.isPropertySignature(m) &&
      m.type &&
      keep(m.name.getText(sourceFile))
    ) {
      members.push({
        name: m.name.getText(sourceFile),
        signature: printer.printNode(
          ts.EmitHint.Unspecified,
          m.type,
          sourceFile,
        ),
      });
      keptTypeNodes.push(m.type);
    }
  }

  // Transitively collect the supporting type aliases the kept members reach.
  /** @type {Set<string>} */
  const referenced = new Set();
  /** @param {ts.Node} node */
  const collect = node => {
    if (ts.isTypeReferenceNode(node)) {
      const tn = node.typeName.getText(sourceFile);
      const alias = aliasMap.get(tn);
      // Skip the root type itself: the renderer synthesizes it from the
      // (possibly filtered) members, so a self-referential return such as
      // `readOnly(): EndoGit` must not pull the full unfiltered alias back in.
      if (alias && tn !== rootType && !referenced.has(tn)) {
        referenced.add(tn);
        collect(alias.type);
      }
    }
    ts.forEachChild(node, collect);
  };
  for (const node of keptTypeNodes) {
    collect(node);
  }

  const auxTypes = [...referenced].sort().map(name => ({
    name,
    text: printer.printNode(
      ts.EmitHint.Unspecified,
      /** @type {ts.TypeAliasDeclaration} */ (aliasMap.get(name)).type,
      sourceFile,
    ),
  }));

  return harden({ rootName: rootType, members, auxTypes });
};
harden(extractTsAliasesIR);

/**
 * The TypeScript renderer for a hand-written `.d.ts` with a `declare module`.
 *
 * @param {object} config
 * @param {URL} config.dtsUrl URL of the `.d.ts` to read.
 * @param {string} config.moduleName The `declare module '<name>'` the root type
 *   lives in.
 * @param {string} config.rootType Name of the root `type` alias to print.
 * @param {string[]} [config.memberFilter] When set, keep only these members.
 * @returns {GlobalTypeIR}
 */
export const extractTsModuleIR = ({
  dtsUrl,
  moduleName,
  rootType,
  memberFilter,
}) => {
  const { sourceFile, aliasMap } = parseDtsModule(dtsUrl, moduleName);
  return extractTsAliasesIR({ sourceFile, aliasMap, rootType, memberFilter });
};
harden(extractTsModuleIR);

/**
 * The TypeScript renderer for a declaration source with top-level exported
 * `type` aliases, such as checked `.ts` typedef hosts.
 *
 * @param {object} config
 * @param {string} config.fileName Source filename for TypeScript diagnostics.
 * @param {string} config.text Declaration source text.
 * @param {string} config.rootType Name of the root `type` alias to print.
 * @param {string[]} [config.memberFilter] When set, keep only these members.
 * @returns {GlobalTypeIR}
 */
export const extractTsFileTextIR = ({
  fileName,
  text,
  rootType,
  memberFilter,
}) => {
  const { sourceFile, aliasMap } = parseTypeAliases(fileName, text);
  return extractTsAliasesIR({ sourceFile, aliasMap, rootType, memberFilter });
};
harden(extractTsFileTextIR);

// #endregion

// #region guard renderer (`guard` -> declaration, via the patterns guard walker)

/**
 * @param {string[]} parts
 * @returns {string[]}
 */
const unique = parts => [...new Set(parts)];

/**
 * Render one method-pattern argument or return guard to a TS type, recording
 * any referenced remotable labels in `refs`.
 *
 * @param {unknown} node
 * @param {Set<string>} refs
 * @returns {string}
 */
const patternToTs = (node, refs) => {
  const ps = passStyleOf(node);
  if (ps === 'string') {
    return JSON.stringify(node);
  }
  if (ps === 'number' || ps === 'boolean') {
    return String(node);
  }
  if (ps === 'bigint') {
    return `${String(node)}n`;
  }
  if (ps !== 'tagged') {
    return 'unknown';
  }
  const tag = getTag(/** @type {any} */ (node));
  const { payload } = /** @type {{ payload: any }} */ (node);
  switch (tag) {
    case 'match:string':
      return 'string';
    case 'match:symbol':
      return 'symbol';
    case 'match:bigint':
      return 'bigint';
    case 'match:number':
    case 'match:nat':
      return 'number';
    case 'match:boolean':
      return 'boolean';
    case 'match:undefined':
      return 'undefined';
    case 'match:null':
      return 'null';
    case 'match:remotable': {
      const label = String(payload.label);
      refs.add(label);
      return label;
    }
    case 'match:kind': {
      switch (String(payload)) {
        case 'string':
          return 'string';
        case 'number':
          return 'number';
        case 'bigint':
          return 'bigint';
        case 'boolean':
          return 'boolean';
        case 'undefined':
          return 'undefined';
        case 'null':
          return 'null';
        case 'symbol':
          return 'symbol';
        case 'promise':
          return 'Promise<unknown>';
        case 'remotable':
          return 'object';
        case 'error':
          return 'Error';
        case 'copyArray':
          return 'unknown[]';
        case 'copyRecord':
          return 'Record<string, unknown>';
        default:
          return 'unknown';
      }
    }
    case 'match:eq': {
      const vps = passStyleOf(payload);
      if (vps === 'string') {
        return JSON.stringify(payload);
      }
      if (vps === 'number' || vps === 'boolean') {
        return String(payload);
      }
      if (vps === 'bigint') {
        return `${String(payload)}n`;
      }
      if (payload === undefined) {
        return 'undefined';
      }
      if (payload === null) {
        return 'null';
      }
      return 'unknown';
    }
    case 'match:or': {
      const parts = /** @type {unknown[]} */ (payload);
      // `M.eref(T)` is `M.or(T, M.promise())`; print it as `ERef<T>`.
      if (parts.length === 2) {
        const promiseIdx = parts.findIndex(
          p =>
            passStyleOf(p) === 'tagged' &&
            getTag(/** @type {any} */ (p)) === 'match:kind' &&
            String(/** @type {{ payload: any }} */ (p).payload) === 'promise',
        );
        if (promiseIdx !== -1) {
          return `ERef<${patternToTs(parts[1 - promiseIdx], refs)}>`;
        }
      }
      return unique(parts.map(p => patternToTs(p, refs))).join(' | ');
    }
    case 'match:and':
      return unique(
        /** @type {unknown[]} */ (payload).map(p => patternToTs(p, refs)),
      ).join(' & ');
    case 'match:arrayOf': {
      const element = Array.isArray(payload) ? payload[0] : payload;
      return `Array<${patternToTs(element, refs)}>`;
    }
    case 'match:recordOf': {
      const [keyPattern, valuePattern] = payload;
      return `Record<${patternToTs(keyPattern, refs)}, ${patternToTs(
        valuePattern,
        refs,
      )}>`;
    }
    default:
      // `M.await(...)` arg wrappers and other guard:* nodes carry an inner
      // `argGuard`; unwrap to the settled shape. Anything else is opaque.
      if (payload && typeof payload === 'object' && 'argGuard' in payload) {
        return patternToTs(payload.argGuard, refs);
      }
      return 'unknown';
  }
};

/**
 * @param {import('@endo/patterns').MethodGuard} methodGuard
 * @param {Set<string>} refs
 * @returns {string}
 */
const methodSignature = (methodGuard, refs) => {
  const {
    argGuards = [],
    optionalArgGuards = [],
    restArgGuard,
    returnGuard,
  } = getMethodGuardPayload(methodGuard);
  const params = [];
  argGuards.forEach((g, i) => params.push(`arg${i}: ${patternToTs(g, refs)}`));
  optionalArgGuards.forEach((g, i) =>
    params.push(`arg${argGuards.length + i}?: ${patternToTs(g, refs)}`),
  );
  if (restArgGuard) {
    params.push(`...rest: ${patternToTs(restArgGuard, refs)}`);
  }
  return `(${params.join(', ')}) => ${patternToTs(returnGuard, refs)}`;
};

/**
 * @param {import('@endo/patterns').InterfaceGuard} interfaceGuard
 * @param {Set<string>} refs
 * @returns {TypeMember[]}
 */
const interfaceMembers = (interfaceGuard, refs) => {
  const { methodGuards } = getInterfaceGuardPayload(interfaceGuard);
  return Object.keys(methodGuards)
    .sort()
    .map(name => ({
      name,
      signature: methodSignature(methodGuards[name], refs),
    }));
};

/**
 * The guard renderer: build a {@link GlobalTypeIR} by walking the root
 * `M.interface` guard and rendering the transitive closure of the remotable
 * interfaces it reaches as supporting `type` aliases. A remotable label present
 * in `registry` is rendered from its guard; a label not registered renders as
 * an opaque `unknown` alias.
 *
 * `ERef<T>` is declared first because every eventual-send return prints as
 * `ERef<...>`; that convention belongs to the guard walker, not to any
 * particular exo.
 *
 * @param {object} config
 * @param {Map<string, import('@endo/patterns').InterfaceGuard>} config.registry
 *   Remotable label -> interface guard, keyed by the label the guards use.
 * @param {string} config.rootLabel The label of the root remotable.
 * @returns {GlobalTypeIR}
 */
export const extractGuardIR = ({ registry, rootLabel }) => {
  /** @type {Set<string>} */
  const refs = new Set();
  const rootGuard = registry.get(rootLabel);
  if (!rootGuard) {
    throw new Error(`no guard registered for ${rootLabel}`);
  }
  const members = interfaceMembers(rootGuard, refs);

  /** @type {AuxType[]} */
  const interfaceAux = [];
  const done = new Set([rootLabel]);
  const queue = [...refs];
  while (queue.length) {
    const name = /** @type {string} */ (queue.shift());
    if (!done.has(name)) {
      done.add(name);
      const guard = registry.get(name);
      if (!guard) {
        interfaceAux.push({ name, text: 'unknown' });
      } else {
        /** @type {Set<string>} */
        const innerRefs = new Set();
        interfaceAux.push({
          name,
          text: renderObjectType(interfaceMembers(guard, innerRefs)),
        });
        for (const ref of innerRefs) {
          if (!done.has(ref)) {
            queue.push(ref);
          }
        }
      }
    }
  }
  interfaceAux.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // `ERef<T>` is referenced by every eventual-send return; declare it first.
  const auxTypes = [
    { name: 'ERef<T>', text: 'T | Promise<T>' },
    ...interfaceAux,
  ];
  return harden({ rootName: rootLabel, members, auxTypes });
};
harden(extractGuardIR);

// #endregion
