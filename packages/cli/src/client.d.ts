export function provideEndoClient<TBootstrap>(name: string, sockPath: string, cancelled: Promise<void>, bootstrap?: TBootstrap | undefined): Promise<{
    getBootstrap: () => Promise<import("@endo/daemon/src/types").EndoBootstrap>;
    closed: Promise<void>;
}>;
//# sourceMappingURL=client.d.ts.map