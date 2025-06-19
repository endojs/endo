// eslint-disable-next-line import/no-extraneous-dependencies
import { makeFileRW } from '@endo/pola-io';
import * as fsp from 'node:fs/promises';

const file = makeFileRW('/', { fsp });
const readonly = file.readOnly();
await readonly.readText(); // Allowed
// @ts-expect-error static error
await readonly.writeText();
