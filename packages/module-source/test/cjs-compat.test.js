/**
 * Compatibility tests ported from `@endo/cjs-module-analyzer`.
 *
 * Each test mirrors a test from `packages/cjs-module-analyzer/test/cjs-module-analyzer.test.js`
 * using `CjsModuleSource` instead of `analyzeCommonJS`.
 *
 * Key differences from the lexer:
 * - `CjsModuleSource` returns `imports` (combined requires + dynamic imports)
 *   instead of a separate `requires` field.
 * - `exports` always includes `'default'` (added by `buildCjsModuleRecord`).
 * - The Babel AST parser correctly parses full object literals, so it can find
 *   more export keys than the character lexer in some edge cases.
 * - Invalid JS that the character lexer could handle (e.g. `{ a = 5 }` as an
 *   object literal) causes a parse error with Babel. These tests are adapted.
 *
 * @module
 */
import test from '@endo/ses-ava/prepare-endo.js';
import { CjsModuleSource } from '../src/cjs-module-source.js';

const analyze = source => new CjsModuleSource(source);

test('analyze exports', t => {
  const { exports, reexports } = analyze(`
    exports.meaning = 42;
  `);
  t.true(exports.includes('meaning'));
  t.true(exports.includes('default'));
  t.deepEqual([...reexports], []);
});

test('analyze default export figure', t => {
  const { exports, reexports } = analyze(`
    module.exports = function () {};
  `);
  t.deepEqual([...exports], ['default']);
  t.deepEqual([...reexports], []);
});

test('analyze exported restructured name', t => {
  const { exports, reexports } = analyze(`
    function a() {}
    module.exports = {a};
  `);
  t.true(exports.includes('a'));
  t.true(exports.includes('default'));
  t.deepEqual([...reexports], []);
});

test('analyze exported quoted identifier to identifier', t => {
  const { exports, reexports } = analyze(`
    function a() {}
    module.exports = {"a": a};
  `);
  t.true(exports.includes('a'));
  t.deepEqual([...reexports], []);
});

test('analyze mix of quoted and unquoted destructed identifiers', t => {
  const { exports, reexports } = analyze(`
    function a() {}
    function b() {}
    function c() {}
    function d() {}
    module.exports = {"a": a, 'b': b, c: c, d};
  `);
  t.true(exports.includes('a'));
  t.true(exports.includes('b'));
  t.true(exports.includes('c'));
  t.true(exports.includes('d'));
  t.deepEqual([...reexports], []);
});

test('analyze reexports', t => {
  const { exports, reexports } = analyze(`
    module.exports = require('./x.js');
  `);
  // No named exports besides 'default' -- the module.exports = require()
  // produces a reexport, not named exports
  t.deepEqual([...exports], ['default']);
  t.deepEqual([...reexports], ['./x.js']);
});

test('esbuild hint style', t => {
  const { exports, reexports } = analyze(`
    0 && (module.exports = {a, b, c}) && __exportStar(require('fs'));
  `);

  t.true(exports.includes('a'));
  t.true(exports.includes('b'));
  t.true(exports.includes('c'));
  t.deepEqual([...reexports], ['fs']);
});

test('Getter opt-outs', t => {
  const { exports } = analyze(`
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
  `);

  // Both defineProperty calls for 'a' are visited. The second one has an
  // unsafe getter, so 'a' ends up in unsafeGetters and gets filtered out.
  t.false(exports.includes('a'));
});

test('TypeScript reexports', t => {
  const { exports, reexports } = analyze(`
    "use strict";
    function __export(m) {
        for (const p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    __export(require("external1"));
    tslib.__export(require("external2"));
    __exportStar(require("external3"));
    tslib1.__exportStar(require("external4"));

    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const color_factory_1 = require("./color-factory");
    Object.defineProperty(exports, "colorFactory", { enumerable: true, get: function () { return color_factory_1.colorFactory; }, });
  `);
  t.true(exports.includes('__esModule'));
  t.true(exports.includes('colorFactory'));
  t.true(reexports.includes('external1'));
  t.true(reexports.includes('external2'));
  t.true(reexports.includes('external3'));
  t.true(reexports.includes('external4'));
});

test('Rollup Babel reexport getter', t => {
  const { exports } = analyze(`
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
  `);
  t.true(exports.includes('a'));
  t.true(exports.includes('c'));
  t.true(exports.includes('d'));
  // 'b' has enumerable: false with a getter -- unsafe per our heuristic
  t.false(exports.includes('b'));
});

test('Rollup Babel reexports', t => {
  const { exports, reexports } = analyze(`
    "use strict";

    exports.__esModule = true;

    not.detect = require("ignored");

    var _external = require("external");

    // Babel <7.12.0, loose mode
    Object.keys(_external).forEach(function (key) {
      if (key === "default" || key === "__esModule") return;
      exports[key] = _external[key];
    });

    var _external2 = require("external2");

    // Babel <7.12.0
    Object.keys(_external2).forEach(function (key) {
      if (key === "default" || /*comment!*/ key === "__esModule") return;
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: function () {
          return _external2[key];
        }
      });
    });

    var _external001 = require("external001");

    // Babel >=7.12.0, loose mode
    Object.keys(_external001).forEach(function (key) {
      if (key === "default" || key === "__esModule") return;
      if (key in exports && exports[key] === _external001[key]) return;
      exports[key] = _external001[key];
    });

    var _external003 = require("external003");

    // Babel >=7.12.0, loose mode, reexports conflicts filter
    Object.keys(_external003).forEach(function (key) {
      if (key === "default" || key === "__esModule") return;
      if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
      if (key in exports && exports[key] === _external003[key]) return;
      exports[key] = _external003[key];
    });

    var _external002 = require("external002");

    // Babel >=7.12.0
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

    // Babel >=7.12.0, reexports conflict filter
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

    Object.keys(external6).forEach(function (k) {
      if (k !== 'default' && !external6.hasOwnProperty(k)) exports[k] = external6[k];
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

    // notexternal12 removed: contains export[y] which Babel rejects as
    // ESM syntax in commonjs sourceType

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
  `);
  t.true(exports.includes('__esModule'));
  t.true(reexports.includes('external'));
  t.true(reexports.includes('external2'));
  t.true(reexports.includes('external001'));
  t.true(reexports.includes('external003'));
  t.true(reexports.includes('external002'));
  t.true(reexports.includes('external004'));
  t.true(reexports.includes('external3'));
  t.true(reexports.includes('external4'));
  t.true(reexports.includes('external😃'));
  t.true(reexports.includes('e5'));
  t.true(reexports.includes('e6'));
  t.true(reexports.includes('external𤭢'));
  t.true(reexports.includes('./styles'));
  t.true(reexports.includes('./styles2'));
  t.true(reexports.includes('./Accordion'));

  // None of the "notexternal" patterns should be detected as reexports
  t.false(reexports.includes('notexternal1'));
  t.false(reexports.includes('notexternal2'));
  t.false(reexports.includes('notexternal3'));
  t.false(reexports.includes('notexternal4'));
  t.false(reexports.includes('notexternal5'));
  t.false(reexports.includes('notexternal6'));
  t.false(reexports.includes('notexternal7'));
  t.false(reexports.includes('notexternal8'));
  t.false(reexports.includes('notexternal9'));
  t.false(reexports.includes('notexternal10'));
  t.false(reexports.includes('notexternal11'));
  t.false(reexports.includes('notexternal13'));
  t.false(reexports.includes('notexternal14'));
  t.false(reexports.includes('notexternal15'));
  t.false(reexports.includes('notexternal16'));
  t.false(reexports.includes('notexternal17'));
});

test('Identify require calls in function arguments', t => {
  const { imports } = analyze(`
    let Mime = require('./Mime');
    Mime(require('./types/standard'), require('./types/other'));
  `);
  t.is(imports.length, 3);
});

test('Identify some invalid require calls as a side effect', t => {
  const { imports } = analyze(`
    const requireBackup = require;
    function neverCalled() {
      const require = ()=>{};
      require('a');
      require('b','c');
      require('./a');
      require(b);
      requireBackup('not-a-chance');
    }
  `);
  // The AST parser (like the lexer) doesn't do scope analysis, so it still
  // detects require() calls inside shadowed scopes.
  t.true(imports.includes('a'));
  t.true(imports.includes('./a'));
  t.false(imports.includes('b'));
  t.false(imports.includes('not-a-chance'));
});

test('non-identifier bracket export name is kept', t => {
  const { exports } = analyze(`
    module.exports['?invalid'] = 'asdf';
  `);
  // Non-identifier export names are emitted verbatim (matching Node/upstream
  // cjs-module-lexer); only strict-reserved words are filtered.
  t.deepEqual([...exports].sort(), ['?invalid', 'default']);
});

test('module exports reexport spread', t => {
  const { exports, reexports, imports } = analyze(`
    module.exports = {
      ...a,
      ...b,
      ...require('dep1'),
      c: d,
      ...require('dep2'),
      name
    };
  `);
  t.true(exports.includes('c'));
  t.true(exports.includes('name'));
  t.deepEqual([...reexports], ['dep1', 'dep2']);
  t.true(imports.includes('dep1'));
  t.true(imports.includes('dep2'));
});

test('Regexp case', t => {
  t.notThrows(() =>
    analyze(`
    class Number {

    }

    /("|')(?<value>(\\\\(\\1)|[^\\1])*)?(\\1)/.exec(\`'\\\\"\\\\'aa'\`);

    const x = \`"\${label.replace(/"/g, "\\\\\\"")}"\`
  `),
  );
});

test('Regexp division', t => {
  t.notThrows(() =>
    analyze(`\nconst x = num / /'/.exec(l)[0].slice(1, -1)//'"`),
  );
});

test('Multiline string escapes', t => {
  t.notThrows(() =>
    analyze(
      "const str = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAABmJLR0QA/wAAAAAzJ3zzAAAGTElEQV\\\r\n\t\tRIx+VXe1BU1xn/zjn7ugvL4sIuQnll5U0ELAQxig7WiQYz6NRHa6O206qdSXXSxs60dTK200zNY9q0dcRpMs1jkrRNWmaijCVoaU';\r\n",
    ),
  );
});

test('Dotted number', t => {
  t.notThrows(() =>
    analyze(`
     const x = 5. / 10;
  `),
  );
});

test('Division operator case', t => {
  t.notThrows(() =>
    analyze(`
    function log(r){
      if(g>=0){u[g++]=m;g>=n.logSz&&(g=0)}else{u.push(m);u.length>=n.logSz&&(g=0)}/^(DBG|TICK): /.test(r)||t.Ticker.tick(454,o.slice(0,200));
    }

    (function(n){
    })();
  `),
  );
});

test('Single parse cases', t => {
  t.notThrows(() => analyze(`'asdf'`));
  t.notThrows(() => analyze(`/asdf/`));
  t.notThrows(() => analyze('`asdf`'));
  t.notThrows(() => analyze(`/**/`));
  t.notThrows(() => analyze(`//`));
});

test('shebang', t => {
  {
    const { exports } = analyze(`#!`);
    t.deepEqual([...exports], ['default']);
  }

  {
    const { exports } = analyze(`#! (  {
      exports.asdf = 'asdf';
    `);
    t.true(exports.includes('asdf'));
  }
});

test('module.exports', t => {
  const { exports } = analyze(`
    module.exports.asdf = 'asdf';
  `);
  t.true(exports.includes('asdf'));
});

test('identifiers', t => {
  const { exports } = analyze(`
    exports['not identifier'] = 'asdf';
    exports['@notidentifier'] = 'asdf';
    Object.defineProperty(exports, "%notidentifier");
    Object.defineProperty(exports, 'hm🤔');
    exports['⨉'] = 45;
    exports['α'] = 54;
    exports.package = 'RESERVED!';
  `);
  // Non-identifier export names are emitted verbatim (matching Node/upstream
  // cjs-module-lexer); only strict-reserved words like `package` are filtered.
  t.true(exports.includes('α'));
  t.true(exports.includes('not identifier'));
  t.true(exports.includes('@notidentifier'));
  t.true(exports.includes('⨉'));
  t.false(exports.includes('package'));
});

test('Literal exports', t => {
  const { exports } = analyze(`
    module.exports = { a, b: c, d, 'e': f };
  `);
  t.true(exports.includes('a'));
  t.true(exports.includes('b'));
  t.true(exports.includes('d'));
  t.true(exports.includes('e'));
});

// Skipped: `{ a = 5, b }` is invalid as an object literal. Babel throws a
// SyntaxError. The lexer handled this because it does character-level scanning
// without full parsing.
// test('Literal exports unsupported')

test('Literal exports example', t => {
  const { exports } = analyze(`
    module.exports = {
      // These WILL be detected as exports
      a: a,
      b: b,

      // This WILL be detected as an export; parsing stops here
      e: require('d'),

      // 'f' is NOT detected: the character-level lexer stops parsing the
      // object literal after the first property whose value is a non-identifier
      // expression (here require('d')).  collectObjectExports now replicates
      // this stop-at-first-hard-property semantics.
      f: 'f'
    }
  `);
  t.true(exports.includes('a'));
  t.true(exports.includes('b'));
  t.true(exports.includes('e'));
  t.false(exports.includes('f'));
});

test('Literal exports complex', t => {
  const { exports } = analyze(`
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
      // For legacy support
      DefaultHandler: DomHandler,
      get RssHandler() {
          return defineProp("RssHandler", this.FeedHandler);
      },
      //helper methods
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
      // List of all events that the parser emits
      EVENTS: {
          /* Format: eventname: number of arguments */
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
  `);
  // Parsing stops at 'Tokenizer' because its value is `require(...)`.
  // Everything after it (ElementType, DomHandler, getters, functions, EVENTS)
  // is NOT detected.
  t.true(exports.includes('Parser'));
  t.true(exports.includes('Tokenizer'));
  t.false(exports.includes('ElementType'));
  t.false(exports.includes('DomHandler'));
  t.false(exports.includes('DefaultHandler'));
  t.false(exports.includes('EVENTS'));
  t.false(exports.includes('FeedHandler'));
  t.false(exports.includes('parseDOM'));
});

test('defineProperty value', t => {
  const { exports } = analyze(`
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
  `);
  // namedExport descriptors both fail the lexer's strict descriptor grammar:
  //   { enumerable: false, value: true } → enumerable:false disqualifies
  //   { configurable: false, value: true } → configurable: key is not allowed
  // as the first key; both land in unsafeGetters.
  t.false(exports.includes('namedExport'));
  t.true(exports.includes('thing'));
  t.true(exports.includes('other'));
  t.true(exports.includes('__esModule'));
  // 'a' getter returns a bare identifier (not x.y / x['y']) -- wait, bare
  // identifiers ARE safe now (matching analyzeCommonJS) but 'a' has
  // enumerable:false, so it is still unsafe.
  // 'b' has configurable:true (no enumerable key), bare-id return -- unsafe
  // 'c' has arrow function getter -- unsafe (not a regular function)
  // 'd' getter calls dynamic() -- unsafe (non-identifier return expression)
  // 'e' getter returns a string literal -- unsafe
  t.false(exports.includes('d'));
  t.false(exports.includes('e'));
});

test('module assign', t => {
  const { exports, reexports } = analyze(`
    module.exports.asdf = 'asdf';
    exports = 'asdf';
    module.exports = require('./asdf');
    if (maybe)
      module.exports = require("./another");
  `);
  t.true(exports.includes('asdf'));
  // Last module.exports = require() wins, clearing previous reexports
  t.deepEqual([...reexports], ['./another']);
});

test('packages tricking Node lexer into finding named exports', t => {
  // Redacted snippet from @tanstack/query-core legacy build
  // https://npmx.dev/package-code/@tanstack/query-core/v/5.101.2/build%2Flegacy%2Findex.cjs
  const { exports, reexports } = analyze(`
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    var index_exports = {};
    __export(index_exports, {
      CancelledError: () => import_retryer.CancelledError,
// NOTE: this not getting picked up by analyzer
      timeoutManager: () => import_timeoutManager.timeoutManager
    });
    module.exports = __toCommonJS(index_exports);
    var import_focusManager = require("./focusManager.cjs");
    __reExport(index_exports, require("./types.cjs"), module.exports);
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      CancelledError,
// NOTE: this is picked up by analyzer
      MadeUpValue,
      ...require("./types.cjs")
    });
    //# sourceMappingURL=index.cjs.map
  `);
  // analyzer accepts the same trick.
  t.deepEqual(exports, ['default', 'CancelledError', 'MadeUpValue']);
  t.deepEqual([...reexports], ['./types.cjs']);
});

test('Simple export with unicode conversions', t => {
  t.throws(() => analyze(`export var p𓀀s,q`));
});

test('Simple import', t => {
  t.throws(() =>
    analyze(`
    import test from "test";
    console.log(test);
  `),
  );
});

test('Exported function', t => {
  t.throws(() =>
    analyze(`
    export function a𓀀 () {

    }
    export class Q{

    }
  `),
  );
});

test('Export destructuring', t => {
  t.throws(() =>
    analyze(`
    export const { a, b } = foo;

    export { ok };
  `),
  );
});

test('Minified import syntax', t => {
  t.throws(() =>
    analyze(
      `import{TemplateResult as t}from"lit-html";import{a as e}from"./chunk-4be41b30.js";export{j as SVGTemplateResult,i as TemplateResult,g as html,h as svg}from"./chunk-4be41b30.js";window.JSCompiler_renameProperty='asdf';`,
    ),
  );
});

test('plus plus division', t => {
  t.notThrows(() =>
    analyze(`
    tick++/fetti;f=(1)+")";
  `),
  );
});

test('return bracket division', t => {
  t.notThrows(() => analyze(`function variance(){return s/(a-1)}`));
});

test('import.meta', t => {
  // Contains `export var` which Babel rejects in CJS mode
  t.throws(() =>
    analyze(`
    export var hello = 'world';
    console.log(import.meta.url);
  `),
  );
});

test('import meta edge cases', t => {
  // Contains `import.\nmeta` which Babel parses as import.meta in CJS and
  // rejects with a syntax error
  t.throws(() =>
    analyze(`
    // Import meta
    import.
     meta
    // Not import meta
    a.
    import.
      meta
  `),
  );
});

test('dynamic import method', t => {
  t.notThrows(() =>
    analyze(`
    class A {
      import() {
      }
    }
  `),
  );
});

test('Bracket matching', t => {
  t.notThrows(() =>
    analyze(`
    instance.extend('parseExprAtom', function (nextMethod) {
      return function () {
        function parseExprAtom(refDestructuringErrors) {
          if (this.type === tt._import) {
            return parseDynamicImport.call(this);
          }
          return c(refDestructuringErrors);
        }
      }();
    });
  `),
  );
});

test('Division / Regex ambiguity', t => {
  t.notThrows(() =>
    analyze(`
    /as)df/; x();
    a / 2; '  /  '
    while (true)
      /test'/
    x-/a'/g
    try {}
    finally{}/a'/g
    (x);{f()}/d'export { b }/g
    ;{}/e'/g;
    {}/f'/g
    a / 'b' / c;
    /a'/ - /b'/;
    +{} /g -'/g'
    ('a')/h -'/g'
    if //x
    ('a')/i'/g;
    /asdf/ / /as'df/; // '
    p = \`\${/test/ + 5}\`;
    /regex/ / x;
    function m() {
      return /*asdf8*// 5/;
    }
  `),
  );
});

test('Template string expression ambiguity', t => {
  const { exports } = analyze(`
    \`$\`
    import('a');
    \`\`
    exports.a = 'a';
    \`a$b\`
    exports['b'] = 'b';
    \`{$}\`
    exports['b'].b;
  `);
  t.true(exports.includes('a'));
  t.true(exports.includes('b'));
});
