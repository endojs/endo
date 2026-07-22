/**
 * Cross-check corpus for CJS lexer parity.
 *
 * Snippets are sourced from the upstream `nodejs/cjs-module-lexer` unit tests
 * and from our existing `cjs-compat.test.js`. Each entry is run through both
 * `analyzeCommonJS` (the executable reference) and `CjsModuleSource` and the
 * results are compared in `parity.test.js`.
 *
 * A `skip` string means the entry is documented but excluded from the
 * cross-check. Valid skip reasons:
 * - Babel cannot parse the snippet (lexer accepts more JS dialects than a full
 *   parser does).
 * - Endo makes an intentional, documented design decision that differs from the
 *   raw lexer output.
 *
 * @see {@link https://github.com/nodejs/cjs-module-lexer/blob/main/test/_unit.js}
 */

/** @type {Array<{name: string, source: string, failing?: string}>} */
export const corpus = [
  // ─── esbuild hint ──────────────────────────────────────────────────────────

  {
    name: 'esbuild hint style',
    source: `
      0 && (module.exports = {a, b, c}) && __exportStar(require('fs'));
    `,
  },

  // ─── Object.defineProperty getters ────────────────────────────────────────

  {
    name: 'Getter opt-outs',
    source: `
      Object.defineProperty(exports, 'a', {
        enumerable: true,
        get: function () {
          return q.p;
        }
      });
      if (false) {
        Object.defineProperty(exports, 'a', {
          enumerable: false,
          get: function () {
            return dynamic();
          }
        });
      }
    `,
  },

  {
    // Adapted: removed the 'f' case (`get: functionget () { ... }`) because
    // `functionget` is a single identifier, not a function keyword + name, so
    // Babel rejects `functionget ()` as a call expression followed by a block
    // statement, which is a syntax error in an object literal.
    //
    // The 'e' case (bare-identifier return) is kept: both `analyzeCommonJS`
    // and our `hasUnsafeGetter` consider a bare-identifier return unsafe (not
    // a MemberExpression), so both exclude 'e'. This is a known divergence
    // from the upstream C lexer, which does include 'e', but it is consistent
    // between our two JS implementations.
    name: 'Rollup Babel reexport getter',
    source: `
      Object.defineProperty(exports, 'a', {
        enumerable: true,
        get: function () {
          return q.p;
        }
      });

      Object.defineProperty(exports, 'b', {
        enumerable: false,
        get: function () {
          return q.p;
        }
      });

      Object.defineProperty(exports, "c", {
        get: function get () {
          return q['p' ];
        }
      });

      Object.defineProperty(exports, 'd', {
        get: function () {
          return __ns.val;
        }
      });

      Object.defineProperty(exports, 'e', {
        get () {
          return external;
        }
      });
    `,
  },

  {
    name: 'TypeScript reexports',
    source: `
      "use strict";
      function __export(m) {
          for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
      }
      Object.defineProperty(exports, "__esModule", { value: true });
      __export(require("external1"));
      tslib.__export(require("external2"));
      __exportStar(require("external3"));
      tslib1.__exportStar(require("external4"));

      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      var color_factory_1 = require("./color-factory");
      Object.defineProperty(exports, "colorFactory", { enumerable: true, get: function () { return color_factory_1.colorFactory; }, });
    `,
  },

  {
    name: 'defineProperty value',
    source: `
      Object.defineProperty(exports, 'namedExport', { enumerable: false, value: true });
      Object.defineProperty(exports, 'namedExport', { configurable: false, value: true });

      Object.defineProperty(exports, 'a', {
        enumerable: false,
        get () {
          return p;
        }
      });
      Object.defineProperty(exports, 'b', {
        configurable: true,
        get () {
          return p;
        }
      });
      Object.defineProperty(exports, 'c', {
        get: () => p
      });
      Object.defineProperty(exports, 'd', {
        enumerable: true,
        get: function () {
          return dynamic();
        }
      });
      Object.defineProperty(exports, 'e', {
        enumerable: true,
        get () {
          return 'str';
        }
      });

      Object.defineProperty(module.exports, 'thing', { value: true });
      Object.defineProperty(exports, "other", { enumerable: true, value: true });
      Object.defineProperty(exports, "__esModule", { value: true });
    `,
  },

  // ─── Star reexports (Babel / Rollup forEach patterns) ─────────────────────

  {
    // Adapted: removed the `notexternal12` block, which contains
    // `export[y] = notexternal12[y]` — Babel rejects `export` as an
    // identifier in CJS source type (it treats it as ESM syntax).
    name: 'Rollup Babel reexports',
    source: `
      "use strict";

      exports.__esModule = true;

      not.detect = require("ignored");

      var _external = require("external");

      Object.keys(_external).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        exports[key] = _external[key];
      });

      var _external2 = require("external2");

      Object.keys(_external2).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: function () {
            return _external2[key];
          }
        });
      });

      var _external001 = require("external001");

      Object.keys(_external001).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        if (key in exports && exports[key] === _external001[key]) return;
        exports[key] = _external001[key];
      });

      var _external003 = require("external003");

      Object.keys(_external003).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
        if (key in exports && exports[key] === _external003[key]) return;
        exports[key] = _external003[key];
      });

      var _external002 = require("external002");

      Object.keys(_external002).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        if (key in exports && exports[key] === _external002[key]) return;
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: function () {
            return _external002[key];
          }
        });
      });

      var _external004 = require("external004");

      Object.keys(_external004).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
        if (key in exports && exports[key] === _external004[key]) return;
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: function () {
            return _external004[key];
          }
        });
      });

      let external3 = require('external3');
      const external4 = require('external4');

      Object.keys(external3).forEach(function (k) {
        if (k !== 'default') Object.defineProperty(exports, k, {
          enumerable: true,
          get: function () {
            return external3[k];
          }
        });
      });
      Object.keys(external4).forEach(function (k) {
        if (k !== 'default') exports[k] = external4[k];
      });

      const externalǽ = require('external😃');
      Object.keys(externalǽ).forEach(function (k) {
        if (k !== 'default') exports[k] = externalǽ[k];
      });

      let external5 = require('e5');
      let external6 = require('e6');
      Object.keys(external5).forEach(function (k) {
        if (k !== 'default' && !Object.hasOwnProperty.call(exports, k)) exports[k] = external5[k];
      });

      const not = require('not');
      Object.keys(not).forEach(function (k) {
        if (k !== 'default' && !a().hasOwnProperty(k)) exports[k] = not[k];
      });

      Object.keys(external6).forEach(function (k) {
        if (k !== 'default' && !exports.hasOwnProperty(k)) exports[k] = external6[k];
      });

      const external𤭢 = require('external𤭢');
      Object.keys(external𤭢).forEach(function (k) {
        if (k !== 'default') exports[k] = external𤭢[k];
      });

      const notexternal1 = require('notexternal1');
      Object.keys(notexternal1);

      const notexternal2 = require('notexternal2');
      Object.keys(notexternal2).each(function(){
      });

      const notexternal3 = require('notexternal3');
      Object.keys(notexternal2).forEach(function () {
      });

      const notexternal4 = require('notexternal4');
      Object.keys(notexternal2).forEach(function (x) {
      });

      const notexternal5 = require('notexternal5');
      Object.keys(notexternal5).forEach(function (x) {
        if (true);
      });

      const notexternal6 = require('notexternal6');
      Object.keys(notexternal6).forEach(function (x) {
        if (x);
      });

      const notexternal7 = require('notexternal7');
      Object.keys(notexternal7).forEach(function(x){
        if (x ==='default');
      });

      const notexternal8 = require('notexternal8');
      Object.keys(notexternal8).forEach(function(x){
        if (x ==='default'||y);
      });

      const notexternal9 = require('notexternal9');
      Object.keys(notexternal9).forEach(function(x){
        if (x ==='default'||x==='__esM');
      });

      const notexternal10 = require('notexternal10');
      Object.keys(notexternal10).forEach(function(x){
        if (x !=='default') return
      });

      const notexternal11 = require('notexternal11');
      Object.keys(notexternal11).forEach(function(x){
        if (x ==='default'||x==='__esModule') return
      });

      const notexternal13 = require('notexternal13');
      Object.keys(notexternal13).forEach(function(x){
        if (x ==='default'||x==='__esModule') return
        exports[y] = notexternal13[y];
      });

      const notexternal14 = require('notexternal14');
      Object.keys(notexternal14).forEach(function(x){
        if (x ==='default'||x==='__esModule') return
        Object.defineProperty(exports, k, {
          enumerable: false,
          get: function () {
            return external14[k];
          }
        });
      });

      const notexternal15 = require('notexternal15');
      Object.keys(notexternal15).forEach(function(x){
        if (x ==='default'||x==='__esModule') return
        Object.defineProperty(exports, k, {
          enumerable: false,
          get: function () {
            return externalnone[k];
          }
        });
      });

      const notexternal16 = require('notexternal16');
      Object.keys(notexternal16).forEach(function(x){
        if (x ==='default'||x==='__esModule') return
        exports[x] = notexternal16[x];
        extra;
      });

      {
        const notexternal17 = require('notexternal17');
        Object.keys(notexternal17).forEach(function(x){
          if (x ==='default'||x==='__esModule') return
          exports[x] = notexternal17[x];
        });
      }

      var _styles = require("./styles");
      Object.keys(_styles).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: function get() {
            return _styles[key];
          }
        });
      });

      var _styles2 = require("./styles2");
      Object.keys(_styles2).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
        Object.defineProperty(exports, key, {
          enumerable: true,
          get () {
            return _styles2[key];
          }
        });
      });

      var _Accordion = _interopRequireWildcard(require("./Accordion"));
      Object.keys(_Accordion).forEach(function (key) {
        if (key === "default" || key === "__esModule") return;
        if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: function () {
            return _Accordion[key];
          }
        });
      });
    `,
  },

  // ─── Object literal exports ────────────────────────────────────────────────

  {
    name: 'module exports reexport spread',
    source: `
      module.exports = {
        ...a,
        ...b,
        ...require('dep1'),
        c: d,
        ...require('dep2'),
        name
      };
    `,
  },

  {
    // Skipped: `{ a = 5, b }` is invalid as an object literal (it is valid
    // only as a destructuring pattern). Babel throws a SyntaxError. The
    // character-level lexer handled this because it does not do full parsing.
    name: 'Literal exports unsupported',
    failing:
      'Babel rejects { a = 5, b } as invalid object literal syntax (valid only as destructuring)',
    source: `
      module.exports = { a = 5, b };
    `,
  },

  {
    name: 'Literal exports',
    source: `
      module.exports = { a, b: c, d, 'e': f };
    `,
  },

  {
    // Key parity case: the character-level lexer stops parsing the object
    // literal after the first property whose value is a non-identifier
    // expression (here `require('d')`). It adds the key 'e' then stops,
    // so 'f' is never detected.
    name: 'Literal exports example',
    source: `
      module.exports = {
        a: a,
        b: b,
        e: require('d'),
        f: 'f'
      }
    `,
  },

  {
    // Key parity case: the lexer stops at 'Tokenizer' (require value), so
    // 'ElementType', 'DomHandler', all getters, etc. are NOT detected.
    name: 'Literal exports complex',
    source: `
      function defineProp(name, value) {
        delete module.exports[name];
        module.exports[name] = value;
        return value;
      }

      module.exports = {
        Parser: Parser,
        Tokenizer: require("./Tokenizer.js"),
        ElementType: require("domelementtype"),
        DomHandler: DomHandler,
        get FeedHandler() {
            return defineProp("FeedHandler", require("./FeedHandler.js"));
        },
        get Stream() {
            return defineProp("Stream", require("./Stream.js"));
        },
        get WritableStream() {
            return defineProp("WritableStream", require("./WritableStream.js"));
        },
        get ProxyHandler() {
            return defineProp("ProxyHandler", require("./ProxyHandler.js"));
        },
        get DomUtils() {
            return defineProp("DomUtils", require("domutils"));
        },
        get CollectingHandler() {
            return defineProp(
                "CollectingHandler",
                require("./CollectingHandler.js")
            );
        },
        DefaultHandler: DomHandler,
        get RssHandler() {
            return defineProp("RssHandler", this.FeedHandler);
        },
        parseDOM: function(data, options) {
            var handler = new DomHandler(options);
            new Parser(handler, options).end(data);
            return handler.dom;
        },
        parseFeed: function(feed, options) {
            var handler = new module.exports.FeedHandler(options);
            new Parser(handler, options).end(feed);
            return handler.dom;
        },
        createDomStream: function(cb, options, elementCb) {
            var handler = new DomHandler(cb, options, elementCb);
            return new Parser(handler, options);
        },
        EVENTS: {
            attribute: 2,
            cdatastart: 0,
            cdataend: 0,
            text: 1,
            processinginstruction: 2,
            comment: 1,
            commentend: 0,
            closetag: 1,
            opentag: 2,
            opentagname: 1,
            error: 1,
            end: 0
        }
      };
    `,
  },

  // ─── Identifier / reserved-word filtering ─────────────────────────────────

  {
    // INTENTIONAL DIVERGENCE: non-identifier export names.
    //
    // Three behaviors are in play here:
    //
    //   - Upstream `cjs-module-lexer` (the project `@endo/cjs-module-analyzer`
    //     was forked from years ago) and Node.js do NO filtering. They emit every
    //     name verbatim, including `'ab cd'`, `'@notidentifier'`, `'⨉'`, and the
    //     reserved words `'package'`/`'var'`. This is correct: an ES module
    //     *binding* name must be an identifier, but the exported *name* can be an
    //     arbitrary string (`export { local as 'weird name' }`).
    //   - `@endo/cjs-module-analyzer` (our reference lexer) over-filters: for
    //     this exact source it returns only `{ exports: ['var'] }`. The intent
    //     behind that filtering was never understood, and asking around turned up
    //     no good reason for it. We do not want to touch the vendored lexer.
    //   - Our `CjsModuleSource` now filters ONLY strict-reserved words (via
    //     `isValidExportName` in `cjs-babel-plugin.js`), matching Node/upstream
    //     rather than the analyzer. So it emits every non-identifier name here
    //     plus `'var'`, and drops only `'package'`.
    //
    // Because `CjsModuleSource` deliberately matches Node while the reference
    // analyzer over-filters, this parity check is EXPECTED to fail (hence
    // `failing`). The behavior is asserted positively in
    // `compartment-mapper/test/cjs-compat.test.js` ("Babel CJS analyzer detects
    // non-identifier export names").
    name: 'non-identifiers',
    failing:
      'CjsModuleSource intentionally matches Node/upstream cjs-module-lexer (emits non-identifier export names verbatim, filtering only reserved words); @endo/cjs-module-analyzer over-filters them, so parity with the reference lexer cannot hold here',
    source: `
      module.exports = { 'ab cd': foo };
      exports['not identifier'] = 'asdf';
      exports['\\\u{D83C}\\\u{DF10}'] = 1;
      exports['\\\u58B8'] = 1;
      exports['\\\n'] = 1;
      exports['\\\xFF'] = 1;
      exports['\\\x09'] = 1;
      exports['\\\x03z'] = 1;
      exports["'"] = 1;
      exports['@notidentifier'] = 'asdf';
      Object.defineProperty(exports, "%notidentifier", { value: x });
      Object.defineProperty(exports, 'hm\\\u{1F914}', { value: x });
      exports['\\\u2A09'] = 45;
      exports['\\\u03B1'] = 54;
      exports.package = 'STRICT RESERVED!';
      exports.var = 'RESERVED';
    `,
  },

  // ─── module.exports assignment patterns ───────────────────────────────────

  {
    name: 'module assign',
    source: `
      module.exports.asdf = 'asdf';
      exports = 'asdf';
      module.exports = require('./asdf');
      if (maybe)
        module.exports = require("./another");
    `,
  },

  {
    name: 'module.exports property',
    source: `
      module.exports.asdf = 'asdf';
    `,
  },

  // ─── Template strings ──────────────────────────────────────────────────────

  {
    name: 'Template string expression ambiguity',
    source: `
      \`$\`
      import('a');
      \`\`
      exports.a = 'a';
      \`a$b\`
      exports['b'] = 'b';
      \`{$}\`
      exports['b'].b;
    `,
  },

  {
    // A property whose value is not an identifier token (`notMuch: 1`) must not
    // be recorded, and it halts the literal parse: the lexer bails on the first
    // "hard" value, so `notMuch` is never emitted and neither is `theOther`.
    name: 'non-identifier property value',
    source: `
    prepopulate();
    const that = 'thing';
    const theOther = 'other'
    module.exports = {
      ...require('./types.cjs'),
      that
    }

    function prepopulate() {
      module.exports = {
        notMuch: 1,
        theOther
      }
    }
  `,
  },
];
