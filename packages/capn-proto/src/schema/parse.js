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
 * @property {string} kind  one of PRIMITIVE_TYPES (lower-cased) or 'list' or
 *   'struct' or 'enum' or 'capability'
 * @property {TypeRef} [elementType]   list element type
 * @property {string} [name]           struct/enum/capability reference name
 * @property {Array<{ name: string, ordinal: number }>} [enumMembers]
 *   For enum-typed fields: the resolved member list, populated during the
 *   post-parse rewriteCapRefs pass.
 */

/**
 * @typedef {object} FieldDecl
 * @property {string} name
 * @property {number} ordinal
 * @property {TypeRef} type
 * @property {string[]} [groupPath]
 *   For fields declared inside a `:group { ... }` clause: the chain of
 *   group names from the outermost struct down to (but not including) the
 *   field itself. The codec uses this to nest the field's value inside the
 *   right sub-object on the JS side. Wire layout is unaffected — group
 *   members live in the parent struct's data/pointer sections.
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
 * @typedef {object} InterfaceMethod
 * @property {string} name
 * @property {number} ordinal
 * @property {string} paramsStructName
 *   Name of the synthetic struct holding this method's parameters. Always
 *   present in `parsed.structs` so the codec can look up its layout.
 * @property {string} resultsStructName
 *   Same, for the method's results.
 */

/**
 * @typedef {object} InterfaceDecl
 * @property {string} name
 * @property {bigint} id
 * @property {Array<InterfaceMethod>} methods
 */

/**
 * @typedef {object} EnumDecl
 * @property {string} name
 * @property {bigint} id
 * @property {Array<{ name: string, ordinal: number }>} members
 */

/**
 * @typedef {object} ParsedSchema
 * @property {bigint | undefined} fileId
 * @property {Map<string, StructDecl>} structs
 * @property {Map<string, EnumDecl>} enums
 * @property {Map<string, InterfaceDecl>} interfaces
 *   Interfaces seen in the schema, keyed by name. A struct field whose
 *   type is an interface name is encoded as a capability pointer
 *   (PTR_OTHER subtag=CAPABILITY) referencing the message's cap table.
 *   Methods are auto-promoted to synthetic structs in `structs`.
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
    } else if ('{}();,@:=->'.includes(c)) {
      // `-` and `>` are needed for the `->` arrow in interface method
      // declarations.
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
  const out = {
    fileId: undefined,
    structs: new Map(),
    enums: new Map(),
    interfaces: new Map(),
  };

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

  /**
   * Recursively parse a `:group { ... }` body, tagging each child field with
   * `groupPath` so the codec can route values into / out of nested JS
   * sub-objects.
   *
   * @param {Array<FieldDecl>} fields
   * @param {string[]} groupPath
   */
  const parseGroupBody = (fields, groupPath) => {
    while (peek() !== '}') {
      // A group body is like a struct body but cannot contain unions or
      // nested struct/enum declarations. Sub-groups are allowed.
      if (peek(1) === ':' && peek(2) === 'group') {
        const subName = eat();
        eat(':');
        eat('group');
        eat('{');
        parseGroupBody(fields, [...groupPath, subName]);
        eat('}');
      } else {
        const f = parseField();
        f.groupPath = groupPath;
        fields.push(f);
      }
    }
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
      if (tok === 'enum') {
        // Nested enum declaration — parse it as a sibling. capnpc namespaces
        // these but our flat name table is fine for the interop subset.
        // eslint-disable-next-line no-use-before-define
        parseEnum();
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
      } else if (peek(1) === ':' && peek(2) === 'group') {
        // Group: `name :group { ... }`. Members are flat-laid in the parent's
        // wire layout but nested under `name` in the JS object.
        const groupName = eat();
        eat(':');
        eat('group');
        eat('{');
        parseGroupBody(fields, [groupName]);
        eat('}');
      } else {
        fields.push(parseField());
      }
    }
    eat('}');
    out.structs.set(name, { name, id, fields, unionMembers });
  };

  const parseEnum = () => {
    eat('enum');
    const name = eat();
    let id = 0n;
    if (peek() === '@') {
      eat('@');
      const idTok = eat();
      if (!idTok.startsWith('0x')) {
        throw Fail`schema parse: enum id must be hex, got ${idTok}`;
      }
      id = BigInt(idTok);
    }
    eat('{');
    /** @type {Array<{ name: string, ordinal: number }>} */
    const members = [];
    while (peek() !== '}') {
      const memberName = eat();
      eat('@');
      const ord = Number(eat());
      if (!Number.isInteger(ord) || ord < 0 || ord > 0xffff) {
        throw Fail`schema parse: bad enum member ordinal ${ord}`;
      }
      eat(';');
      members.push({ name: memberName, ordinal: ord });
    }
    eat('}');
    out.enums.set(name, { name, id, members });
  };

  /**
   * Parse `(name :Type, name :Type, ...)` — used for interface method
   * params and results. Returns a list of FieldDecls with auto-assigned
   * sequential ordinals (capnp method args have implicit `@N` ordinals
   * starting at 0). Empty `()` yields an empty list.
   */
  const parseParamList = () => {
    eat('(');
    /** @type {Array<FieldDecl>} */
    const fields = [];
    let ord = 0;
    while (peek() !== ')') {
      const fname = eat();
      eat(':');
      const type = parseType();
      fields.push({ name: fname, ordinal: ord, type });
      ord += 1;
      if (peek() === ',') eat(',');
    }
    eat(')');
    return fields;
  };

  const parseInterface = () => {
    eat('interface');
    const ifaceName = eat();
    let id = 0n;
    if (peek() === '@') {
      eat('@');
      const idTok = eat();
      if (!idTok.startsWith('0x')) {
        throw Fail`schema parse: interface id must be hex, got ${idTok}`;
      }
      id = BigInt(idTok);
    }
    eat('{');
    /** @type {Array<InterfaceMethod>} */
    const methods = [];
    while (peek() !== '}') {
      const methodName = eat();
      eat('@');
      const ord = Number(eat());
      if (!Number.isInteger(ord) || ord < 0 || ord > 0xffff) {
        throw Fail`schema parse: bad method ordinal ${ord}`;
      }
      const params = parseParamList();
      eat('-');
      eat('>');
      const results = parseParamList();
      eat(';');
      // Synthesize Params and Results structs in the global struct table.
      const paramsName = `${ifaceName}$${methodName}$Params`;
      const resultsName = `${ifaceName}$${methodName}$Results`;
      out.structs.set(paramsName, {
        name: paramsName,
        id: 0n,
        fields: params,
        unionMembers: undefined,
      });
      out.structs.set(resultsName, {
        name: resultsName,
        id: 0n,
        fields: results,
        unionMembers: undefined,
      });
      methods.push({
        name: methodName,
        ordinal: ord,
        paramsStructName: paramsName,
        resultsStructName: resultsName,
      });
    }
    eat('}');
    out.interfaces.set(ifaceName, { name: ifaceName, id, methods });
  };

  /**
   * After parsing the whole file, walk every struct field and rewrite any
   * `{ kind: 'struct', name: X }` whose `X` is the name of an interface OR
   * enum declaration to the corresponding kind. This pass exists because
   * the parser cannot tell a struct ref from an interface or enum ref by
   * looking at the type token alone — the file may declare the
   * interface/enum later than the struct that uses it.
   *
   * @param {TypeRef} t
   */
  const rewriteCapRefs = t => {
    if (t.kind === 'struct' && t.name) {
      if (out.interfaces.has(t.name)) {
        // mutate in place — every ref to t was created in this parse run
        // and is uniquely owned by exactly one field.
        // eslint-disable-next-line no-param-reassign
        t.kind = 'capability';
      } else if (out.enums.has(t.name)) {
        const decl = out.enums.get(t.name);
        // eslint-disable-next-line no-param-reassign
        t.kind = 'enum';
        // Attach the member list so the codec can resolve names ↔ ordinals
        // without a separate enum registry traversal.
        // eslint-disable-next-line no-param-reassign
        t.enumMembers = decl ? decl.members : [];
      }
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
      // eslint-disable-next-line no-use-before-define
      parseInterface();
    } else if (tok === 'enum') {
      parseEnum();
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
