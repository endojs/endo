// @ts-check
/*
 * Minimal Cap'n Proto schema-language parser.
 *
 * Supports the subset needed for schema-typed RPC payloads:
 *   - File-level `@0xId;` (parsed but only the id is captured).
 *   - `struct Name @0xId { ... }` declarations (id required by capnp).
 *   - Field declarations: `name @ord :Type [= default];` — defaults are
 *     parsed and discarded.
 *   - Primitive types: Bool, Int8/16/32/64, UInt8/16/32/64, Float32, Float64,
 *     Text, Data, Void.
 *   - List types: `List(T)`.
 *   - Nested struct references by name.
 *   - `#` line comments.
 *
 * Out of scope (will throw `unsupported`): unions, groups, enums, generics,
 * interfaces, annotations, constants, imports.
 *
 * Layout offsets are *not* assigned here — see `./layout.js`. Parser output
 * is a plain object tree that downstream layout/encode/decode passes
 * consume.
 *
 * Note: this block intentionally opens with a single asterisk so it is a
 * plain block comment, not a JSDoc comment — the `@N` schema-language
 * tokens above would otherwise be parsed by typedoc as JSDoc tags.
 */

import { Fail } from '@endo/errors';

const PRIMITIVE_TYPES = new Set([
  'Void',
  'Bool',
  'Int8',
  'Int16',
  'Int32',
  'Int64',
  'UInt8',
  'UInt16',
  'UInt32',
  'UInt64',
  'Float32',
  'Float64',
  'Text',
  'Data',
]);

/**
 * @typedef {object} TypeRef
 * @property {string} kind  one of PRIMITIVE_TYPES (lower-cased) or 'list' or 'struct'
 * @property {TypeRef} [elementType]   list element type
 * @property {string} [name]           struct reference name
 */

/**
 * @typedef {object} FieldDecl
 * @property {string} name
 * @property {number} ordinal
 * @property {TypeRef} type
 */

/**
 * @typedef {object} StructDecl
 * @property {string} name
 * @property {bigint} id
 * @property {Array<FieldDecl>} fields            non-union fields, in declaration order
 * @property {Array<FieldDecl> | undefined} unionMembers
 *   When present, this struct also carries an anonymous union whose members
 *   are listed here in declaration order. The discriminator value of each
 *   member is its index in this array (NOT its `@N` field ordinal).
 */

/**
 * @typedef {object} InterfaceDecl
 * @property {string} name
 * @property {bigint} id
 */

/**
 * @typedef {object} ParsedSchema
 * @property {bigint | undefined} fileId
 * @property {Map<string, StructDecl>} structs
 * @property {Set<string>} interfaces
 *   Names of interface declarations seen in the schema. A struct field
 *   whose type is an interface name is encoded as a capability pointer
 *   (PTR_OTHER subtag=CAPABILITY) referencing the message's cap table.
 */

/**
 * Strip comments + collapse whitespace into single spaces, then return a
 * tokenized stream. Tokens preserve identifiers, integers, hex literals,
 * and single-character punctuation `{}();,@:=`.
 *
 * @param {string} src
 */
const tokenize = src => {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '#') {
      while (i < n && src[i] !== '\n') i += 1;
    } else if (/\s/.test(c)) {
      i += 1;
    } else if ('{}();,@:='.includes(c)) {
      tokens.push(c);
      i += 1;
    } else if (c === '0' && src[i + 1] === 'x') {
      let j = i + 2;
      while (j < n && /[0-9a-fA-F]/.test(src[j])) j += 1;
      tokens.push(src.slice(i, j));
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j += 1;
      tokens.push(src.slice(i, j));
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      tokens.push(src.slice(i, j));
      i = j;
    } else if (c === '"') {
      // Lexer keeps string literals (used in default values) intact.
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') j += 1;
        j += 1;
      }
      tokens.push(src.slice(i, j + 1));
      i = j + 1;
    } else {
      throw Fail`schema parse: unexpected character ${c} at offset ${i}`;
    }
  }
  return tokens;
};

/**
 * @param {string} src
 * @returns {ParsedSchema}
 */
export const parseCapnpSchema = src => {
  const toks = tokenize(src);
  let i = 0;
  const peek = (k = 0) => toks[i + k];
  const eat = expected => {
    const t = toks[i];
    if (expected !== undefined && t !== expected) {
      throw Fail`schema parse: expected ${expected}, got ${t}`;
    }
    i += 1;
    return t;
  };

  /** @type {ParsedSchema} */
  const out = { fileId: undefined, structs: new Map(), interfaces: new Set() };

  // File-level `@0x...;` (optional in our parser).
  if (peek() === '@') {
    eat('@');
    const idTok = eat();
    if (!idTok.startsWith('0x')) {
      throw Fail`schema parse: file id must be hex literal, got ${idTok}`;
    }
    out.fileId = BigInt(idTok);
    eat(';');
  }

  /** @returns {TypeRef} */
  const parseType = () => {
    const tok = eat();
    if (PRIMITIVE_TYPES.has(tok)) {
      return { kind: tok.toLowerCase() };
    }
    if (tok === 'List') {
      eat('(');
      const inner = parseType();
      eat(')');
      return { kind: 'list', elementType: inner };
    }
    // Otherwise: a named struct reference.
    return { kind: 'struct', name: tok };
  };

  // Skip a default-value expression: stop at `;`. We don't honor defaults yet
  // but they're syntactically permitted.
  const skipDefault = () => {
    while (peek() !== ';' && i < toks.length) i += 1;
  };

  /** @returns {FieldDecl} */
  const parseField = () => {
    const name = eat();
    eat('@');
    const ord = Number(eat());
    if (!Number.isInteger(ord) || ord < 0) {
      throw Fail`schema parse: bad field ordinal ${ord}`;
    }
    eat(':');
    const type = parseType();
    if (peek() === '=') {
      eat('=');
      skipDefault();
    }
    eat(';');
    return { name, ordinal: ord, type };
  };

  const parseStruct = () => {
    eat('struct');
    const name = eat();
    let id;
    if (peek() === '@') {
      eat('@');
      const idTok = eat();
      if (!idTok.startsWith('0x')) {
        throw Fail`schema parse: struct id must be hex, got ${idTok}`;
      }
      id = BigInt(idTok);
    } else {
      // Allowed in our parser; capnp itself requires it.
      id = 0n;
    }
    eat('{');
    /** @type {Array<FieldDecl>} */
    const fields = [];
    /** @type {Array<FieldDecl> | undefined} */
    let unionMembers;
    while (peek() !== '}') {
      const tok = peek();
      if (tok === 'enum' || tok === 'group') {
        throw Fail`schema parse: ${tok} not supported`;
      } else if (tok === 'union') {
        if (unionMembers !== undefined) {
          throw Fail`schema parse: only one anonymous union per struct`;
        }
        eat('union');
        eat('{');
        unionMembers = [];
        while (peek() !== '}') {
          unionMembers.push(parseField());
        }
        eat('}');
      } else if (tok === 'struct') {
        // Nested struct declaration — supported by parsing it as a sibling
        // for now (capnp does namespace it, but our flat name table works
        // for the interop subset).
        parseStruct();
      } else {
        fields.push(parseField());
      }
    }
    eat('}');
    out.structs.set(name, { name, id, fields, unionMembers });
  };

  /**
   * After parsing the whole file, walk every struct field and rewrite any
   * `{ kind: 'struct', name: X }` whose `X` is the name of an interface
   * declaration to `{ kind: 'capability', name: X }`. This pass exists
   * because the parser cannot tell a struct ref from an interface ref by
   * looking at the type token alone — the file may declare the interface
   * later than the struct that uses it.
   *
   * @param {TypeRef} t
   */
  const rewriteCapRefs = t => {
    if (t.kind === 'struct' && t.name && out.interfaces.has(t.name)) {
      // mutate in place — every ref to t was created in this parse run
      // and is uniquely owned by exactly one field.
      // eslint-disable-next-line no-param-reassign
      t.kind = 'capability';
    } else if (t.kind === 'list' && t.elementType) {
      rewriteCapRefs(t.elementType);
    }
  };

  while (i < toks.length) {
    const tok = peek();
    if (tok === 'struct') {
      parseStruct();
    } else if (tok === 'using' || tok === 'const' || tok === 'annotation') {
      // Skip the rest of the declaration up through `;`.
      while (peek() !== ';' && i < toks.length) i += 1;
      eat(';');
    } else if (tok === 'interface') {
      // We don't model interface methods (this package handles RPC method
      // dispatch separately via interfaceRegistry). Record the name so
      // struct fields whose type is an interface ref are recognized as
      // capability pointers, then skip the body.
      eat('interface');
      const ifaceName = eat();
      if (peek() === '@') {
        eat('@');
        eat();
      }
      out.interfaces.add(ifaceName);
      eat('{');
      let depth = 1;
      while (depth > 0 && i < toks.length) {
        const t = peek();
        if (t === '{') depth += 1;
        else if (t === '}') depth -= 1;
        i += 1;
      }
    } else if (tok === 'enum') {
      throw Fail`schema parse: top-level ${tok} not supported in this subset`;
    } else {
      throw Fail`schema parse: unexpected token ${tok}`;
    }
  }

  for (const struct of out.structs.values()) {
    for (const f of struct.fields) rewriteCapRefs(f.type);
    if (struct.unionMembers) {
      for (const m of struct.unionMembers) rewriteCapRefs(m.type);
    }
  }

  return out;
};
