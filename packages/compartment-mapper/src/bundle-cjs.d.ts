declare namespace _default {
    export { runtime };
    export function getBundlerKit({ index, indexedImports, record: { cjsFunctor, exports: exportsList }, }: {
        index: any;
        indexedImports: any;
        record: {
            cjsFunctor: any;
            exports?: {} | undefined;
        };
    }): {
        getFunctor: () => string;
        getCells: () => string;
        getReexportsWiring: () => string;
        getFunctorCall: () => string;
    };
}
export default _default;
declare const runtime: string;
//# sourceMappingURL=bundle-cjs.d.ts.map