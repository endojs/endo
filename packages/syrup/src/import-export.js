import { SyrupStructuredRecordCodecType } from './codec.js';

/*
  These are OCapN Descriptors, they are Passables that are used both
  directly in OCapN Messages and as part of Passable structures.
*/

export const DescImportObject = new SyrupStructuredRecordCodecType(
  'desc:import-object', [
  ['position', 'integer'],
])

export const DescImportPromise = new SyrupStructuredRecordCodecType(
  'desc:import-promise', [
  ['position', 'integer'],
])

export const DescExport = new SyrupStructuredRecordCodecType(
  'desc:export', [
  ['position', 'integer'],
])

export const DescAnswer = new SyrupStructuredRecordCodecType(
  'desc:answer', [
  ['position', 'integer'],
])