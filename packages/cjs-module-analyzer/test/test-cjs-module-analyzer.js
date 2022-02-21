import test from 'ava';
import { analyzeCommonJS } from '../index.js';

test('analyze exports', t => {
  const { exports, reexports } = analyzeCommonJS(`
    exports.meaning = 42;
  `);
  t.deepEqual(exports, ['meaning']);
  t.deepEqual(reexports, []);
});

test('analyze default export figure', t => {
  const { exports, reexports } = analyzeCommonJS(`
    module.exports = function () {};
  `);
  t.deepEqual(exports, ['default']);
  t.deepEqual(reexports, []);
});

test('analyze exported restructured name', t => {
  const { exports, reexports } = analyzeCommonJS(`
    function a() {}
    module.exports = {a};
  `);
  t.deepEqual(exports, ['a']);
  t.deepEqual(reexports, []);
});

test('analyze exported quoted identifier to identifier', t => {
  const { exports, reexports } = analyzeCommonJS(`
    function a() {}
    module.exports = {"a": a};
  `);
  t.deepEqual(exports, ['a']);
  t.deepEqual(reexports, []);
});

test('analyze mix of quoted and unquoted destructed identifiers', t => {
  const { exports, reexports } = analyzeCommonJS(`
    function a() {}
    function b() {}
    function c() {}
    function d() {}
    module.exports = {"a": a, 'b': b, c: c, d};
  `);
  t.deepEqual(exports, ['a', 'b', 'c', 'd']);
  t.deepEqual(reexports, []);
});

test('analyze reexports', t => {
  const { exports, reexports } = analyzeCommonJS(`
    module.exports = require('./x.js');
  `);
  t.deepEqual(exports, []);
  t.deepEqual(reexports, ['./x.js']);
});

test('esbuild hint style', t => {
  const { exports, reexports } = analyzeCommonJS(`
    0 && (module.exports = {a, b, c}) && __exportStar(require('fs'));
  `);

  t.is(exports.length, 3);
  t.is(exports[0], 'a');
  t.is(exports[1], 'b');
  t.is(exports[2], 'c');
  t.is(reexports.length, 1);
  t.is(reexports[0], 'fs');
});

test('Getter opt-outs', t => {
  const { exports } = analyzeCommonJS(`
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

  t.is(exports.length, 0);
});

test('TypeScript reexports', t => {
  const { exports, reexports } = analyzeCommonJS(` 
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
  t.is(exports.length, 2);
  t.is(exports[0], '__esModule');
  t.is(exports[1], 'colorFactory');
  t.is(reexports.length, 4);
  t.is(reexports[0], 'external1');
  t.is(reexports[1], 'external2');
  t.is(reexports[2], 'external3');
  t.is(reexports[3], 'external4');
});

test('Rollup Babel reexport getter', t => {
  const { exports } = analyzeCommonJS(`
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

    Object.defineProperty(exports, "f", {
      get: functionget () {
        return q['p' ];
      }
    });
  `);
  t.is(exports.length, 4);
  t.is(exports[0], 'a');
  t.is(exports[1], 'c');
  t.is(exports[2], 'd');
  t.is(exports[3], 'e');
});

test('Rollup Babel reexports', t => {
  const { exports, reexports } = analyzeCommonJS(`
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

    const notexternal12 = require('notexternal12');
    Object.keys(notexternal12).forEach(function(x){
      if (x ==='default'||x==='__esModule') return
      export[y] = notexternal12[y];
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
  `);
  t.is(exports.length, 1);
  t.is(exports[0], '__esModule');
  t.is(reexports.length, 15);
  t.is(reexports[0], 'external');
  t.is(reexports[1], 'external2');
  t.is(reexports[2], 'external001');
  t.is(reexports[3], 'external003');
  t.is(reexports[4], 'external002');
  t.is(reexports[5], 'external004');
  t.is(reexports[6], 'external3');
  t.is(reexports[7], 'external4');
  t.is(reexports[8], 'external😃');
  t.is(reexports[9], 'e5');
  t.is(reexports[10], 'e6');
  t.is(reexports[11], 'external𤭢');
  t.is(reexports[12], './styles');
  t.is(reexports[13], './styles2');
  t.is(reexports[14], './Accordion');
});

test('Identify require calls in function arguments', t => {
  const { requires } = analyzeCommonJS(`
    let Mime = require('./Mime');
    Mime(require('./types/standard'), require('./types/other'));
  `);
  t.is(requires.length, 3);
});

// This test exists to demonstrate limitations, not the required behavior. If parser is improved, this should to be updated to reflect new behavior.
test('Identify some invalid require calls as a side effect', t => {
  const { requires } = analyzeCommonJS(`
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
  t.deepEqual(requires, ['a', './a']);
});

test('invalid exports cases', t => {
  const { exports } = analyzeCommonJS(`
    module.exports['?invalid'] = 'asdf';
  `);
  t.is(exports.length, 0);
});

test('module exports reexport spread', t => {
  const { exports, reexports, requires } = analyzeCommonJS(`
    module.exports = {
      ...a,
      ...b,
      ...require('dep1'),
      c: d,
      ...require('dep2'),
      name
    };
  `);
  t.is(exports.length, 2);
  t.is(exports[0], 'c');
  t.is(exports[1], 'name');
  t.is(reexports.length, 2);
  t.is(reexports[0], 'dep1');
  t.is(reexports[1], 'dep2');
  t.is(requires.length, 2);
});

test('Regexp case', t => {
  t.plan(0);
  analyzeCommonJS(`
    class Number {

    }
    
    /("|')(?<value>(\\\\(\\1)|[^\\1])*)?(\\1)/.exec(\`'\\\\"\\\\'aa'\`);
    
    const x = \`"\${label.replace(/"/g, "\\\\\\"")}"\`
  `);
});

test('Regexp division', t => {
  t.plan(0);
  analyzeCommonJS(`\nconst x = num / /'/.exec(l)[0].slice(1, -1)//'"`);
});

test('Multiline string escapes', t => {
  t.plan(0);
  analyzeCommonJS(
    "const str = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAABmJLR0QA/wAAAAAzJ3zzAAAGTElEQV\\\r\n\t\tRIx+VXe1BU1xn/zjn7ugvL4sIuQnll5U0ELAQxig7WiQYz6NRHa6O206qdSXXSxs60dTK200zNY9q0dcRpMs1jkrRNWmaijCVoaU';\r\n",
  );
});

test('Dotted number', t => {
  t.plan(0);
  analyzeCommonJS(`
     const x = 5. / 10;
  `);
});

test('Division operator case', t => {
  t.plan(0);
  analyzeCommonJS(`
    function log(r){
      if(g>=0){u[g++]=m;g>=n.logSz&&(g=0)}else{u.push(m);u.length>=n.logSz&&(g=0)}/^(DBG|TICK): /.test(r)||t.Ticker.tick(454,o.slice(0,200));
    }
    
    (function(n){
    })();
  `);
});

test('Single parse cases', t => {
  t.plan(0);
  analyzeCommonJS(`'asdf'`);
  analyzeCommonJS(`/asdf/`);
  analyzeCommonJS(`\`asdf\``);
  analyzeCommonJS(`/**/`);
  analyzeCommonJS(`//`);
});

test('shebang', t => {
  {
    const { exports } = analyzeCommonJS(`#!`);
    t.is(exports.length, 0);
  }

  {
    const { exports } = analyzeCommonJS(`#! (  {
      exports.asdf = 'asdf';
    `);
    t.is(exports.length, 1);
    t.is(exports[0], 'asdf');
  }
});

test('module.exports', t => {
  const { exports } = analyzeCommonJS(`
    module.exports.asdf = 'asdf';
  `);
  t.is(exports.length, 1);
  t.is(exports[0], 'asdf');
});

test('identifiers', t => {
  const { exports } = analyzeCommonJS(`
    exports['not identifier'] = 'asdf';
    exports['@notidentifier'] = 'asdf';
    Object.defineProperty(exports, "%notidentifier");
    Object.defineProperty(exports, 'hm🤔');
    exports['⨉'] = 45;
    exports['α'] = 54;
    exports.package = 'RESERVED!';
  `);
  t.is(exports.length, 1);
  t.is(exports[0], 'α');
});

test('Literal exports', t => {
  const { exports } = analyzeCommonJS(`
    module.exports = { a, b: c, d, 'e': f };
  `);
  t.is(exports.length, 4);
  t.is(exports[0], 'a');
  t.is(exports[1], 'b');
  t.is(exports[2], 'd');
  t.is(exports[3], 'e');
});

test('Literal exports unsupported', t => {
  const { exports } = analyzeCommonJS(`
    module.exports = { a = 5, b };
  `);
  t.is(exports.length, 1);
  t.is(exports[0], 'a');
});

test('Literal exports example', t => {
  const { exports } = analyzeCommonJS(`
    module.exports = {
      // These WILL be detected as exports
      a: a,
      b: b,
      
      // This WILL be detected as an export
      e: require('d'),
    
      // These WONT be detected as exports
      // because the object parser stops on the non-identifier
      // expression "require('d')"
      f: 'f'
    }
  `);
  t.is(exports.length, 3);
  t.is(exports[2], 'e');
});

test('Literal exports complex', t => {
  const { exports } = analyzeCommonJS(`    
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
  t.is(exports.length, 2);
  t.is(exports[0], 'Parser');
  t.is(exports[1], 'Tokenizer');
});

test('defineProperty value', t => {
  const { exports } = analyzeCommonJS(`
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
  t.is(exports.length, 3);
  t.is(exports[0], 'thing');
  t.is(exports[1], 'other');
  t.is(exports[2], '__esModule');
});

test('module assign', t => {
  const { exports, reexports } = analyzeCommonJS(`
    module.exports.asdf = 'asdf';
    exports = 'asdf';
    module.exports = require('./asdf');
    if (maybe)
      module.exports = require("./another");
  `);
  t.is(exports.length, 1);
  t.is(exports[0], 'asdf');
  t.is(reexports.length, 1);
  t.is(reexports[0], './another');
});

test('Simple export with unicode conversions', t => {
  const source = `export var p𓀀s,q`;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('Simple import', t => {
  const source = `
    import test from "test";
    console.log(test);
  `;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('Exported function', t => {
  const source = `
    export function a𓀀 () {

    }
    export class Q{

    }
  `;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('Export destructuring', t => {
  const source = `
    export const { a, b } = foo;

    export { ok };
  `;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('Minified import syntax', t => {
  const source = `import{TemplateResult as t}from"lit-html";import{a as e}from"./chunk-4be41b30.js";export{j as SVGTemplateResult,i as TemplateResult,g as html,h as svg}from"./chunk-4be41b30.js";window.JSCompiler_renameProperty='asdf';`;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('plus plus division', t => {
  t.plan(0);
  analyzeCommonJS(`
    tick++/fetti;f=(1)+")";
  `);
});

test('return bracket division', t => {
  const source = `function variance(){return s/(a-1)}`;
  t.assert(analyzeCommonJS(source));
});

test('import.meta', t => {
  const source = `
    export var hello = 'world';
    console.log(import.meta.url);
  `;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('import meta edge cases', t => {
  const source = `
    // Import meta
    import.
     meta
    // Not import meta
    a.
    import.
      meta
  `;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('dynamic import method', t => {
  const source = `
    class A {
      import() {
      }
    }
  `;
  t.assert(analyzeCommonJS(source));
});

test('Comments', t => {
  const source = `/*
  VERSION
*/import util from 'util';

//
function x() {
}

    /**/
    // '
    /* / */
    /*

       * export { b }
    \\*/export { a }

    function () {
      /***/
    }
  `;
  t.throws(() => {
    analyzeCommonJS(source);
  });
});

test('Bracket matching', t => {
  t.assert(
    analyzeCommonJS(`
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
  const source = `
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
  `;
  t.assert(analyzeCommonJS(source));
});

test('Template string expression ambiguity', t => {
  const source = `
    \`$\`
    import('a');
    \`\`
    exports.a = 'a';
    \`a$b\`
    exports['b'] = 'b';
    \`{$}\`
    exports['b'].b;
  `;
  const { exports } = analyzeCommonJS(source);
  t.assert(exports[0] === 'a');
  t.assert(exports[1] === 'b');
});
