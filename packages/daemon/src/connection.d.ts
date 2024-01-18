export function makeNodeNetstringCapTP<TBootstrap>(name: string, nodeWriter: import('stream').Writable, nodeReader: import('stream').Readable, cancelled: Promise<void>, bootstrap: TBootstrap): {
    getBootstrap: () => Promise<any>;
    closed: Promise<void>;
};
//# sourceMappingURL=connection.d.ts.map