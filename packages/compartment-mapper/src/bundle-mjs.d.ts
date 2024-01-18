export const runtime: "function observeImports(map, importName, importIndex) {\n  for (const [name, observers] of map.get(importName)) {\n    const cell = cells[importIndex][name];\n    if (cell === undefined) {\n      throw new ReferenceError(`Cannot import name ${name}`);\n    }\n    for (const observer of observers) {\n      cell.observe(observer);\n    }\n  }\n}\n";
declare namespace _default {
    export { runtime };
    export function getBundlerKit({ index, indexedImports, record: { __syncModuleProgram__, __fixedExportMap__, __liveExportMap__, __reexportMap__, reexports, }, }: {
        index: any;
        indexedImports: any;
        record: {
            __syncModuleProgram__: any;
            __fixedExportMap__?: {} | undefined;
            __liveExportMap__?: {} | undefined;
            __reexportMap__?: {} | undefined;
            reexports: any;
        };
    }): {
        getFunctor: () => string;
        getCells: () => string;
        getReexportsWiring: () => any;
        getFunctorCall: () => string;
    };
}
export default _default;
//# sourceMappingURL=bundle-mjs.d.ts.map