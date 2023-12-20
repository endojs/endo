/** @type {import("ses").AssertionFunctions } */
export const assert: import("ses").AssertionFunctions;
export const bare: (payload: any, spaces?: string | number | undefined) => import("ses").ToStringable;
export const makeError: (details?: import("ses").Details | undefined, errorConstructor?: ErrorConstructor | undefined, options?: import("ses").AssertMakeErrorOptions | undefined) => Error;
export const note: (error: Error, details: import("ses").Details) => void;
export const quote: (payload: any, spaces?: string | number | undefined) => import("ses").ToStringable;
export const redacted: (template: string[] | TemplateStringsArray, ...args: any) => import("ses").DetailsToken;
export const throwRedacted: (template: string[] | TemplateStringsArray, ...args: any) => never;
//# sourceMappingURL=index.d.ts.map