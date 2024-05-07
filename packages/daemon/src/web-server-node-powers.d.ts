export function makeHttpPowers({ http, ws }: {
    ws: typeof import('ws');
    http: typeof import('http');
}): {
    servePortHttp: ({ port, host, respond, connect, cancelled, }: {
        port: number;
        host: string;
        respond?: HttpRespond | undefined;
        connect?: HttpConnect | undefined;
        cancelled: Promise<never>;
    }) => Promise<any>;
};
import type { HttpRespond } from './types.js';
import type { HttpConnect } from './types.js';
//# sourceMappingURL=web-server-node-powers.d.ts.map