export function makeEnvironmentCaptor(aGlobal: object): Readonly<{
    getEnvironmentOption: (optionName: string, defaultSetting: string) => string;
    getCapturedEnvironmentOptionNames: () => readonly any[];
}>;
//# sourceMappingURL=env-options.d.ts.map