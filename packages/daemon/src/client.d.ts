export function makeEndoClient<TBootstrap>(name: string, sockPath: string, cancelled: Promise<void>, bootstrap?: TBootstrap | undefined): Promise<{
    getBootstrap: () => Promise<any>;
    closed: Promise<void>;
}>;
//# sourceMappingURL=client.d.ts.map