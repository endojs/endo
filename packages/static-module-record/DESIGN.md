# Module transforms

This package uses a transformation from a JS module source to a corresponding
JS program that, when evaluated, produces a function that can execute a module
and orchestrate its imports and exports.
The static module record includes the static analysis of the module: what it
imports and exports and how it refers to imported modules.

The workflow for executing a module, as conducted by a Compartment,
is to analyze the module source, link with other modules based on the static
record's metadata, evaluate the functor, call the functor with linkage.

```js
import { makeModuleAnalyzer } from './src/transform-analyze.js';
const analyze = makeModuleAnalyzer();
const moduleAnalysis = analyze(moduleSource);
const moduleFunctor = evaluateModuleFunctor(moduleAnalysis.functorSource, /* ... */);
moduleFunctor({
  imports(importedVariableUpdaters) { /* ... */ },
  liveVar: exportedVariableUpdaters,
  onceVar: exportedConstantEmitters,
  importMeta: Object.create(null)
});
```

So, for example, the following module uses import and export somewhat
thoroughly.

```js
import foo from 'import-default-export-from-me.js';
import * as bar from 'import-all-from-me.js';
import { fizz, buzz } from 'import-named-exports-from-me.js';
import { color as colour } from 'import-named-export-and-rename.js';

export let quuux = null;

export { qux } from 'import-and-reexport-name-from-me.js';
export * from 'import-and-export-all.js';
export default 42;
export const quux = 'Hello, World!';

const aleph = 0;
export { aleph as alpha };
export { grey as gray } from './reexport-name-and-rename.js';

// Late binding of an exported variable.
quuux = 'Hello, World!';
```

From this, the analyzer produces a static module record that shows what modules
the module needs to be linked to and how to link their imports and exports.

```js
{
  "exportAlls": [ "import-and-export-all.js" ],
  "imports": {
    "import-default-export-from-me.js": [ "default" ],
    "import-all-from-me.js": [ "*" ],
    "import-named-exports-from-me.js": [ "fizz", "buzz" ],
    "import-named-export-and-rename.js": [ "color" ],
    "import-and-reexport-name-from-me.js": [ "qux" ],
    "import-and-export-all.js": [],
    "reexport-name-and-rename.js": [ "grey" ],
  },
  "liveExportMap": {
    "gray": [ "grey", false ],
    "qux": [ "qux", false ],
    "quuux": [ "quuux", true ],
  },
  "fixedExportMap": {
    "alpha": [ "aleph" ],
    "default": [ "default" ],
    "quux": [ "quux" ],
  }
}
```

The functor source, the module transformed into a program, has the following
shape.
The names are additionally obscured with Unicode zero-width-joiners to avoid
collisions with sensibly constructed modules, and the transformation preserves
line numbers.

```js
(({
  imports: $h_imports,
  liveVar: $h_live,
  onceVar: $h_once,
  importMeta: $h_import_meta,
}) => {
  let foo, bar, fizz, buzz, colour;
  $h_imports(
    new Map([
      ["import-default-export-from-me.js", new Map([
        ["default", [$h_a => (foo = $h_a)]],
      ])],
      ["import-all-from-me.js", new Map([
        ["*", [$h_a => (bar = $h_a)]]
      ])],
      ["import-named-exports-from-me.js", new Map([
        ["fizz", [$h_a => (fizz = $h_a)]],
        ["buzz", [$h_a => (buzz = $h_a)]],
      ])],
      ["import-named-export-and-rename.js", new Map([
        ["color", [$h_a => (colour = $h_a)]],
      ])],
      ["import-and-reexport-name-from-me.js", new Map([
        ["qux", [$h_live["qux"]]]
      ])],
      ["import-and-export-all.js", new Map([])]
    ]),
    ["import-and-export-all.js"]
  );

  let $c_quuux = null;
  $h_live.quuux($c_quuux);

  const { default: $c_default } = { default: 42 };

  $h_once.default($c_default);

  const quux = 'Hello, World!';
  $h_once.quux(quux);

  quuux = 'Sorry for binding late!';
})
```

For the final live binding to `quuux`, we depend on the evaluator to put a
Proxy on the scope chain to intercept the assignment and effect an update
to all modules that import the value.

```ts
// This is the signature of the analyze function, after composing it
// with Babel core.
type Analyzer = ({string: ModuleSource}) => ModuleAnalysis

type ModuleSource = string

type ModuleAnalysis = {
  exportAlls: ExportAlls,
  imports: Imports,
  liveExportMap: LiveExportMap,
  fixedExportMap: FixedExportMap,
  functorSource: string,
};

// ExportAlls are the relative module specifiers found in directives like:
//   export * from 'import-and-reexport-all-from-me.js';
// These are both on the static module record and passed to the import function
// injected into a module functor.
// TODO Consider removing the import argument.
// It does not appear to be used by module instances.
type ExportAlls = Array<RelativeModuleSpecifier>

// Imports includes a key for every relative module specifier in
// any static import declaration, including those implied by
// export/from clauses.
// The import names are the names from the dependency module
// that this module will import.
// If this module reexports names from the dependency module
// but doesn't capture them in its own scope, the imports map
// has an entry for the module but the array of import names is empty.
type Imports = Object<RelativeModuleSpecifier, Array<ImportNames>)

// ImportName is the name of a property of a module namespace object.
type ImportName = string

// LiveExportMap indicates which variables in this module's scope
// need to emit updates when they change.
type LiveExportMap = Object<ExportName, [ExportName, SetProxyTrap]>

// FixedExportMap indicates which constants in this module's scope
// need to emit updates when they are initialized.
// FixedExportMap is an aesthetic subtype of LiveExportMap.
// The single box around ImportName is not meaningful.
type FixedExportMap = Object<ExportName, [ExportName]>

// ExportName is the name of a property of a module namespace object.
type ExportName = string

// SetProxyTrap indicates that the variable has a temporal
// dead-zone and the module namespace should throw a ReferenceError
// before its first update.
type SetProxyTrap = bool

type ModuleFunctor = (UpdaterArgument):void
type UpdaterArgument = {
  imports(Updaters, ExportAlls) => void,
  liveVar(Exporters) => void,
  onceVar(Exporters) => void,
};

// Update functions communicate values both out of one module's scope and into
// another module's scope.
type UpdateFunction = (value:any) => void

// Modules use updaters to receive their imports
// as the exporting modules update them.
type Updaters = Map<RelativeModuleSpecifier, ModuleUpdaters>>
type ModuleUpdaters = Map<ImportName, Array<UpdateFunction>>
type ImportName = string
type RelativeModuleSpecifier = string

// Modules use update functions to ship values out.
type Exporters = Object<ExportName, UpdateFunction>
```
