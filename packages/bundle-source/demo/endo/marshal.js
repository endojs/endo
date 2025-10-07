import { makeMarshal } from '@endo/marshal';

let savedError = null;

const { toCapData } = makeMarshal(undefined, undefined, {
  serializeBodyFormat: 'smallcaps',
  marshalSaveError: err => {
    savedError = err;
  },
});

export const result = toCapData(Error('boom'));
export const marshalledError = savedError;
