export function makeFinalizingMap<K, V extends unknown>(finalizer?: ((key: K) => void) | undefined, opts?: {
    weakValues?: boolean | undefined;
} | undefined): Pick<Map<K, V>, "get" | "has" | "delete"> & {
    set: (key: K, value: V) => void;
    clearWithoutFinalizing: () => void;
    getSize: () => number;
} & import("@endo/eventual-send").RemotableBrand<{}, FinalizingMap<K, V>>;
export type FinalizingMap<K, V extends unknown> = Pick<Map<K, V>, 'get' | 'has' | 'delete'> & {
    set: (key: K, value: V) => void;
    clearWithoutFinalizing: () => void;
    getSize: () => number;
};
//# sourceMappingURL=finalize.d.ts.map