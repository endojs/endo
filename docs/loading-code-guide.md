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
          - makeModuleInstance creates an instance for esm (and that's waaaay more complicated)
      > instantiate and link return: `{notifiers: {…}, exportsProxy: Proxy, execute: ƒ}`
    - execute is called from link (*no await, runs synchronously*)
      - [parse-cjs.js:28](https://github.com/endojs/endo/blob/7b2b7206d8ed5f6cb0a0abe0026c5426f9cc8651/packages/compartment-mapper/src/parse-cjs.js#L28) execute is called (*but it's an async function*)
        - this is where the module code runs  
        - compartmentImportNow is called recursively for each require invoked by the module being executed
        - whatever execute returns, is being ignored (*for now, I guess*)
        

     
## compartmentMapForNodeModules deep dive

TODO: go on the deep dive

## memoizedLoadWithErrorAnnotation deep dive

TODO: go on the deep dive
