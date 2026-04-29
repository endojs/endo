import { encodeHex } from '@endo/hex';
import crypto from 'crypto';

export const randomHex16 = () =>
  new Promise((resolve, reject) =>
    crypto.randomBytes(16, (err, bytes) => {
      if (err) {
        reject(err);
      } else {
        resolve(encodeHex(bytes));
      }
    }),
  );
