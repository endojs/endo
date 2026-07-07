import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath, parseOptionalPetNamePath } from '../pet-name.js';

export const mkhost = async ({
  handleName,
  agentName,
  agentNames,
  introducedNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    // A slash-delimited handle or agent name nests the host inside a
    // directory; the parent directory must already exist (as with
    // `mkdir`, `store`, and `mv`).
    const newHost = await E(agent).provideHost(parsePetNamePath(handleName), {
      introducedNames,
      agentName: parseOptionalPetNamePath(agentName),
    });
    console.log(newHost);
  });
