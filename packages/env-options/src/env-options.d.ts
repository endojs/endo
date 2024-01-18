export function makeEnvironmentCaptor(aGlobal: object, dropNames?: boolean | undefined): Readonly<{
    getEnvironmentOption: (optionName: string, defaultSetting: string, optOtherValues?: string[] | undefined) => string;
    getEnvironmentOptionsList: (optionName: string) => string[];
    environmentOptionsListHas: (optionName: any, element: any) => any;
    getCapturedEnvironmentOptionNames: () => readonly any[];
}>;
/**
 * Gets an environment option by name and returns the option value or the
 * given default.
 *
 * @param {string} optionName
 * @param {string} defaultSetting
 * @param {string[]} [optOtherValues]
 * If provided, the option value must be included or match `defaultSetting`.
 * @returns {string}
 */
export function getEnvironmentOption(optionName: string, defaultSetting: string, optOtherValues?: string[] | undefined): string;
/**
 * @param {string} optionName
 * @returns {string[]}
 */
export function getEnvironmentOptionsList(optionName: string): string[];
export function environmentOptionsListHas(optionName: any, element: any): any;
//# sourceMappingURL=env-options.d.ts.map