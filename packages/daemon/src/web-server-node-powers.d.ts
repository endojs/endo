export function makeHttpPowers({ http, ws }: {
    ws: typeof import('ws');
    http: typeof import('http');
}): {
    servePortHttp: ({ port, host, respond, connect, cancelled, }: {
        port: number;
        host: string;
        respond?: import("./types.js").HttpRespond | undefined;
        connect?: import("./types.js").HttpConnect | undefined;
        cancelled: Promise<never>;
    }) => Promise<any>;
};
//# sourceMappingURL=web-server-node-powers.d.ts.map