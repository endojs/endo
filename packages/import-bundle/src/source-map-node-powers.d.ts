export function makeEndoSourceMapLocator(powers: {
    url: typeof import('node:url');
    os: typeof import('node:os');
    process: Process;
}): ({ sha512 }: {
    sha512: string;
}) => string;
export type Process = {
    env: Record<string, string | undefined>;
    platform: string;
};
//# sourceMappingURL=source-map-node-powers.d.ts.map