export function trivialComparator(left: any, right: any): 1 | -1 | 0;
export function getPassStyleCover(passStyle: PassStyle): RankCover;
export function makeComparatorKit(compareRemotables?: RankCompare | undefined): RankComparatorKit;
export function comparatorMirrorImage(comparator: RankCompare): RankCompare | undefined;
export function isRankSorted(passables: any[], compare: RankCompare): boolean;
export function assertRankSorted(sorted: any[], compare: RankCompare): true;
export function sortByRank(passables: Iterable<any>, compare: RankCompare): any[];
export function getIndexCover(sorted: any[], compare: RankCompare, [leftKey, rightKey]: RankCover): IndexCover;
/** @type {RankCover} */
export const FullRankCover: RankCover;
export function coveredEntries(sorted: any[], [leftIndex, rightIndex]: IndexCover): Iterable<[number, any]>;
export function unionRankCovers(compare: RankCompare, covers: RankCover[]): RankCover;
export function intersectRankCovers(compare: RankCompare, covers: RankCover[]): RankCover;
export const compareRank: RankCompare;
export const compareAntiRank: RankCompare;
export function makeFullOrderComparatorKit(longLived?: boolean | undefined): FullComparatorKit;
export type RankComparatorKit = {
    comparator: RankCompare;
    antiComparator: RankCompare;
};
export type FullComparatorKit = {
    comparator: RankCompare;
    antiComparator: RankCompare;
};
export type IndexCover = [number, number];
export type PassStyleRanksRecord = {
    string: {
        index: number;
        cover: RankCover;
    };
    number: {
        index: number;
        cover: RankCover;
    };
    bigint: {
        index: number;
        cover: RankCover;
    };
    boolean: {
        index: number;
        cover: RankCover;
    };
    symbol: {
        index: number;
        cover: RankCover;
    };
    undefined: {
        index: number;
        cover: RankCover;
    };
    null: {
        index: number;
        cover: RankCover;
    };
    copyRecord: {
        index: number;
        cover: RankCover;
    };
    copyArray: {
        index: number;
        cover: RankCover;
    };
    tagged: {
        index: number;
        cover: RankCover;
    };
    remotable: {
        index: number;
        cover: RankCover;
    };
    error: {
        index: number;
        cover: RankCover;
    };
    promise: {
        index: number;
        cover: RankCover;
    };
};
import type { PassStyle } from '@endo/pass-style';
import type { RankCover } from './types.js';
import type { RankCompare } from './types.js';
//# sourceMappingURL=rankOrder.d.ts.map