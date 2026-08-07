# Loading and running code guide

## Loading and running cjs - first pass

*I didn't go into compartmentMapForNodeModules, Compartment constructor and memoizedLoadWithErrorAnnotation*

😎➡️ consumer calls loadLocation

[import.js:35](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/import.js#L35) loadLocation  
  - compartmentMapForNodeModules creates **compartmentMap**  🤔 See the deep dive  
  - creates execute function  

> loadLocation returns: `{ import: execute }` 

😎➡️ consumer calls application.import()

[import.js:63](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/import.js#L63) execute  
  - creates makeImportHook with makeImportHookMaker() and passes it down to link  
  - link function creates compartments for all entries in **compartmentMap**  

➡️ [import.js:73](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/import.js#L73) { compartment } = link(**compartmentMap**,{…})  
  - [link.js:332](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/link.js#L332) loop over compartmentDescriptors from **compartmentMap**  
    - makes sure .modules is an empty object if missing  
    - const parse = mapParsers()  
      - [link.js:77](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/link.js#L77) is where parse function is put together. 
    - makeImportHook is used to create an import hook ([link.js:354](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/link.js#L354)) TODO: describe what for
    - moduleMapHook is created
    - resolve from [node-module-specifier.js](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/node-module-specifier.js) is used as resolver, no way to override
    - compartment is created
    - [link.js:367](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/link.js#L367) 
    - loop saves compartment: `compartments[compartmentName] = compartment`

  - [link.js:383](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/link.js#L383) checks if the compartment that represents the package that's been explicitly requested by consumer is in the map. returns it as `compartment`

> link returns: `{ compartment, compartments, resolvers }`  
link() was synchronous 

➡️ [import.js:84](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/import.js#L84) compartment.import(moduleSpecifier)   
[compartment-shim.js:144](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/compartment-shim.js#L144)  
  - assertModuleHooks
  - ➡️ *asynchronously* load() [module-load.js:271](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-load.js#L271)
    - load calls `memoizedLoadWithErrorAnnotation` (🤔 See the deep dive) which recursively goes through modules in the compartment and adds them to the `pendingJobs`
    - `pendingJobs` are awaited for in a loop
    - errors don't propagate from jobs, they're collected in an array (each job has a catch for that)
    - if any errors were colleted, an Error is thrown containing details from all underlaying errors.
  - compartmentImportNow(*reference to the compartment itself*, specifier) after load
    - link is called from [module-link.js](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-link.js#L37) (not the same link!)  
     `link` creates `ModuleInstances` and `ModuleNamespaces` for a module and its
     transitive dependencies and connects their imports and exports.
     After linking, the resulting working set is ready to be executed.
      - [module-link.js:132](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-link.js#L132) instantiate()
        - creates moduleInstance by calling the appropriate function from  
        [module-instance.js](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-instance.js)  
          - makeThirdPartyModuleInstance creates an instance for cjs modules
          - makeModuleInstance creates an instance for esm (and that's more complicated)
      > instantiate and link return: `{notifiers: {…}, exportsProxy: Proxy, execute: ƒ}`
    - execute is called from link (*no await, runs synchronously*)
      - [parse-cjs.js:28](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/parse-cjs.js#L28) execute is called (*but it's an async function*)
        - this is where the module code runs  
        - compartmentImportNow is called recursively for each require invoked by the module being executed
        - whatever execute returns, is being ignored (*for now, I guess*)
        

## Module instance and import

Let's take an example index.mjs

In [module-instance.js](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-instance.js)  

`makeModuleInstance` is called to create an instance of index.mjs.  
`makeThirdPartyModuleInstance` is used for the CommonJS modules.

`makeModuleInstance` 
[module-instance.js:328](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-instance.js#L328) defines an imports function and passed to the [functor](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-instance.js#L407), a callable form of the module, when it's invoked inside `execute`.

Functor uses code with import instrumentation, where
```js
import defaultAsName from './module-exports-assigned-object.cjs';
import * as namespaceAsName from './module-exports-assigned-object.cjs';
``` 
got translated to 
```js
(({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   let defaultAsName,namespaceAsName;$h‍_imports([["./module-exports-assigned-object.cjs", [["default", [$h‍_a => (defaultAsName = $h‍_a)]],["*", [$h‍_a => (namespaceAsName = $h‍_a)]]]]]);   
```
`$h‍_imports` is the imports function. Its argument is entries consisting of module specifier and functions to call with each import result.

Each module specifier is used to find the module instance in importedInstances and run its execute()

After execute is done, instance's exports are made reachable externally through notifiers.  
In [module-instance.js:347](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-instance.js#L347) - expectations from import statements are matched with exports provided by the instance.


What happensnext, in [module-instance.js:354](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/ses/src/module-instance.js#L354), is each of the functions passed to import, like `$h‍_a => (namespaceAsName = $h‍_a`, gets passed as argument to a notifier from the module instance that's being imported. They're matched by export name, including `'*'` in this case. Notifier is responsible for calling the function with the appropriate value.

To make `import * from 'a.cjs'` work, `makeThirdPartyModuleInstance` needs to define a notifier for `*` in the map of notifiers. 



## compartmentMapForNodeModules deep dive

TODO: go on the deep dive

## memoizedLoadWithErrorAnnotation deep dive

TODO: go on the deep dive
