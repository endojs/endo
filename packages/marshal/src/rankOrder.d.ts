export function trivialComparator(left: any, right: any): 1 | -1 | 0;
export function getPassStyleCover(passStyle: PassStyle): import("./types.js").RankCover;
export function makeComparatorKit(compareRemotables?: RankCompare | undefined): RankComparatorKit;
export function comparatorMirrorImage(comparator: RankCompare): RankCompare | undefined;
export function isRankSorted(passables: Passable[], compare: RankCompare): boolean;
export function assertRankSorted(sorted: Passable[], compare: RankCompare): true;
export function sortByRank(passables: Iterable<Passable>, compare: RankCompare): Passable[];
export function getIndexCover(sorted: Passable[], compare: RankCompare, [leftKey, rightKey]: import("./types.js").RankCover): IndexCover;
/** @type {RankCover} */
export const FullRankCover: import("./types.js").RankCover;
export function coveredEntries(sorted: Passable[], [leftIndex, rightIndex]: IndexCover): Iterable<[number, Passable]>;
export function unionRankCovers(compare: RankCompare, covers: import("./types.js").RankCover[]): import("./types.js").RankCover;
export function intersectRankCovers(compare: RankCompare, covers: import("./types.js").RankCover[]): import("./types.js").RankCover;
export const compareRank: import("./types.js").RankCompare;
export const compareAntiRank: import("./types.js").RankCompare;
export function makeFullOrderComparatorKit(longLived?: boolean | undefined): FullComparatorKit;
export type Passable = import('@endo/pass-style').Passable;
export type PassStyle = import('@endo/pass-style').PassStyle;
export type RankCover = import('./types.js').RankCover;
export type RankComparison = import('./types.js').RankComparison;
export type RankCompare = import('./types.js').RankCompare;
export type FullCompare = import('./types.js').FullCompare;
export type RankComparatorKit = {
    comparator: RankCompare;
    antiComparator: RankCompare;
};
export type FullComparatorKit = {
    comparator: FullCompare;
    antiComparator: FullCompare;
};
export type IndexCover = [number, number];
export type PassStyleRanksRecord = Record<PassStyle, {
    index: number;
    cover: [string, string];
}>;
//# sourceMappingURL=rankOrder.d.ts.map