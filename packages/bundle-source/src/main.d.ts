export function main(args: [to: string, dest: string, ...rest: string[]], { loadModule, pid, log }: {
    loadModule: (spec: string) => any;
    pid: number;
    log?: import("../cache.js").Logger | undefined;
}): Promise<void>;
//# sourceMappingURL=main.d.ts.map