export function isValidNumber(allegedNumber: string): boolean;
export function assertValidNumber(allegedNumber: string): void;
export function assertValidId(id: string, petName?: string | undefined): void;
export function parseId(id: string): IdRecord;
export function formatId({ number, node }: IdRecord): string;
import type { IdRecord } from './types.js';
//# sourceMappingURL=formula-identifier.d.ts.map