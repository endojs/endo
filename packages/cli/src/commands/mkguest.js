import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath, parseOptionalPetNamePath } from '../pet-name.js';

export const mkguest = async ({
  handleName,
  agentName,
  agentNames,
  introducedNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    // A slash-delimited handle or agent name nests the guest inside a
    // directory; the parent directory must already exist (as with
    // `mkdir`, `store`, and `mv`).
    const newGuest = await E(agent).provideGuest(parsePetNamePath(handleName), {
      introducedNames,
      agentName: parseOptionalPetNamePath(agentName),
    });
    console.log(newGuest);
  });
