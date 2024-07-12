/* global process */
import fs from 'fs';
import os from 'os';

import { makeNodeReader } from '@endo/stream-node';
import { makeReaderRef } from '@endo/daemon';
import { E } from '@endo/far';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * @param {Array<Uint8Array>} arrays
 * @returns {Uint8Array}
 */
const concat = arrays => {
  let totalLength = 0;
  for (const array of arrays) {
    totalLength += array.byteLength;
  }

  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.byteLength;
  }

  return result;
};

/**
 * @param {AsyncIterable<Uint8Array>} reader
 */
const asyncConcat = async reader => {
  const chunks = [];
  for await (const chunk of reader) {
    chunks.push(chunk);
  }
  return concat(chunks);
};

export const store = async ({
  name,
  agentNames,
  storePath,
  storeStdin,
  storeText,
  storeTextStdin,
  storeJson,
  storeJsonStdin,
  storeBigInt,
}) => {
  const modes = {
    storePath,
    storeStdin,
    storeText,
    storeTextStdin,
    storeJson,
    storeJsonStdin,
    storeBigInt,
  };
  const selectedModes = Object.entries(modes).filter(
    ([_modeName, value]) => value !== undefined,
  );
  const selectedModeNames = selectedModes.map(([modeName]) => modeName);
  if (selectedModes.length !== 1) {
    // Usage error should be reported without trace.
    // eslint-disable-next-line no-throw-literal
    throw `Must provide exactly one store flag. Got flags for: (${selectedModeNames.join(
      ', ',
    )})`;
  }

  const parsedName = parsePetNamePath(name);

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await null;
    if (storeText !== undefined) {
      await E(agent).storeValue(storeText, parsedName);
    } else if (storeJson !== undefined) {
      await E(agent).storeValue(JSON.parse(storeJson), parsedName);
    } else if (storeBigInt !== undefined) {
      await E(agent).storeValue(BigInt(storeBigInt), parsedName);
    } else if (storeTextStdin !== undefined) {
      const reader = makeNodeReader(process.stdin);
      const bytes = await asyncConcat(reader);
      const text = new TextDecoder().decode(bytes);
      await E(agent).storeValue(text, parsedName);
    } else if (storeJsonStdin !== undefined) {
      const reader = makeNodeReader(process.stdin);
      const bytes = await asyncConcat(reader);
      const text = new TextDecoder().decode(bytes);
      await E(agent).storeValue(JSON.parse(text), parsedName);
    } else if (storeStdin !== undefined) {
      const reader = makeNodeReader(process.stdin);
      const readerRef = makeReaderRef(reader);
      await E(agent).storeBlob(readerRef, parsedName);
    } else if (storePath !== undefined) {
      const nodeReadStream = fs.createReadStream(storePath);
      const reader = makeNodeReader(nodeReadStream);
      const readerRef = makeReaderRef(reader);
      await E(agent).storeBlob(readerRef, parsedName);
    }
  });
};
