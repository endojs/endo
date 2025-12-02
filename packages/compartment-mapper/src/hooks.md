# Review of compartment-mapper hooks



| Hook Name                 | Description                                                                           |
|-------------------------- | --- |
| `packageDataHook`         | Receives all found package descriptors data before graph translation.                                   |
| `packageDependenciesHook` | Allows dynamic mutation of dependencies during node_modules graph translation.              |
| `unknownCanonicalNameHook`| Called when the policy references unknown canonical names, can suggest typos/similar names. |
| `moduleSourceHook`        | Invoked when a module source is created.                                             |
| `packageConnectionsHook`  | Surfaces connections during digest. (ignored in archiving)                                               |



[Type declarations for the hooks](./types/external.ts)

```mermaid
graph TB

  exports((public exports))
  exports -.- compartmentMapForNodeModules
  exports -.- mapNodeModules
  exports -.- loadLocation
  exports -.- importLocation
  exports -.- captureFromMap
  exports -.- importFromMap
  exports -.- loadFromMap
  exports -.- digestCompartmentMap
  exports -.- makeFunctor
  exports -.- makeScript


subgraph "import-hook.js"
  moduleSourceHook{{moduleSourceHook}} -.- note5["for all module sources read"]
  makeDeferError --> moduleSourceHook
  makeImportHookMaker --> makeDeferError
  makeImportNowHookMaker --> makeDeferError
  makeImportNowHookMaker -- via importNowHook --> chooseModuleDescriptor --> executeLocalModuleSourceHook--> moduleSourceHook
  makeImportHookMaker --via importHook exitModule logic--> moduleSourceHook
  makeImportHookMaker --via importHook call--> chooseModuleDescriptor
end

subgraph "node-modules.js"
  compartmentMapForNodeModules --> packageDataHook{{packageDataHook}} -.- note0["called once"]
  compartmentMapForNodeModules --> unknownCanonicalNameHook{{unknownCanonicalNameHook}} -.- note1["for all issues from policy;<br>after defaultUnknownCanonicalNameHandler"]
  compartmentMapForNodeModules --> translateGraph --> packageDependenciesHook{{packageDependenciesHook}} -.-note3["for all locatons in graph<br>after defaultPackageDependenciesFilter"]
  mapNodeModules --> compartmentMapForNodeModules

end

subgraph "digest.js"
  digestCompartmentMap --> translateCompartmentMap --> packageConnectionsHook{{packageConnectionsHook}} -.- note4["for all retained compartments"]
end

subgraph "bundle.js"
  makeFunctor -- options:can include hooks ----------> mapNodeModules
  makeScript -- options:can include hooks ----------> mapNodeModules
end


subgraph "import-lite.js"
  importFromMap --> loadFromMap ---> makeImportHookMaker
  loadFromMap ----> makeImportNowHookMaker
end


subgraph "capture-lite.js"
  captureFromMap -----> makeImportHookMaker
  captureFromMap --> captureCompartmentMap --> digestCompartmentMap
end


subgraph "import.js"
  loadLocation ----------> mapNodeModules
  importLocation --> loadLocation
  loadLocation --> loadFromMap
end


%% STYLING
classDef note fill:#999, stroke:#ccb
class note0,note1,note2,note3,note4,note5 note

```



<details>
<summary>Bundle and Archive bits of the diagram that don't use hooks</summary>

These are calling the functions accepting hooks but don't pass them

> [TODO]
> copy-paste this to the main diagram whenever the connections are made.

```mermaid

graph TB

subgraph "bundle.js"
  makeFunctor -- options:transparently ----------> mapNodeModules
  makeScript -- options:transparently ----------> mapNodeModules
  makeFunctorFromMap  -- no moduleSourceHook ----x makeImportHookMaker
end

subgraph "bundle-lite.js"
makeFunctorFromMap2 --no moduleSourceHook -----x makeImportHookMaker
end

subgraph "archive-lite.js"
digestFromMap -- no moduleSourceHook -----x makeImportHookMaker
makeArchiveCompartmentMap --no packageConnectionsHook----x digestCompartmentMap
end

subgraph "archive.js"
archive(("multiple <br> methods")) --no hooks passed-----------x mapNodeModules
end

```

</details>



