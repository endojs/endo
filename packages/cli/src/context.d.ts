export function withInterrupt(callback: any): Promise<void>;
export function withEndoBootstrap({ os, process, clientName }: {
    os: any;
    process: any;
    clientName?: string | undefined;
}, callback: any): Promise<void>;
export function withEndoHost({ os, process }: {
    os: any;
    process: any;
}, callback: any): Promise<void>;
export function withEndoAgent(agentNamePath: any, { os, process }: {
    os: any;
    process: any;
}, callback: any): Promise<void>;
//# sourceMappingURL=context.d.ts.map