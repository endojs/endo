import os from 'os';
import { inspect } from 'util';
import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { withEndoHost } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/** @import { ERef } from '@endo/eventual-send' */

const prettyValue = val => {
  let result;
  const type = typeof val;
  if (type === 'string') {
    result = `'${val}'`;
  } else if (type === 'object') {
    result = `${val}`;
    const noise = '[object Alleged: ';
    if (result.startsWith(noise)) {
      result = result.substring(noise.length);
      result = result.substring(0, result.length - 1);
    } else {
      result = inspect(val);
    }
  } else {
    result = inspect(val);
  }
  return result;
};

const pad = (fieldVal, width, minPad = 2) => {
  let spaces = width - `${fieldVal}`.length;
  if (spaces < minPad) {
    spaces = minPad;
  }
  return ' '.repeat(spaces);
};

/**
 * Inventory grouping parallels the chat inventory's `INVENTORY_GROUPS` in
 * `packages/space-chat/src/inventory/tree-source.js` so CLI and Chat present
 * the same buckets. Keep these tables in sync when adding new formula types to
 * either side. The declaration order is the printed heading order, fixed
 * manually to the maintainer's PR #405 sequence: Handles, Directories, Values,
 * Capabilities, Agents, Personas.
 *
 * @typedef {{ key: string, label: string, types: ReadonlySet<string> }} InventoryGroup
 */

/** @type {ReadonlyArray<InventoryGroup>} */
export const INVENTORY_GROUPS = [
  {
    key: 'handles',
    label: 'Handles',
    types: new Set(['handle']),
  },
  {
    key: 'directories',
    label: 'Directories',
    types: new Set([
      'directory',
      'readable-tree',
      'mount',
      'scratch-mount',
      'pet-store',
    ]),
  },
  {
    key: 'values',
    label: 'Values',
    types: new Set(['marshal']),
  },
  {
    key: 'capabilities',
    label: 'Capabilities',
    types: new Set(),
  },
  {
    key: 'agents',
    label: 'Agents',
    types: new Set(['guest']),
  },
  {
    key: 'personas',
    label: 'Personas',
    types: new Set(['host']),
  },
];

/**
 * The catch-all group for any unenumerated or undefined type. Resolved by key
 * rather than by array position, since `capabilities` is no longer last in the
 * manually-ordered heading list.
 */
const CAPABILITIES_GROUP =
  INVENTORY_GROUPS.find(group => group.key === 'capabilities') ??
  INVENTORY_GROUPS[INVENTORY_GROUPS.length - 1];

/**
 * Bucket a formula type into one of the inventory groups. Mirrors the
 * chat-side `groupKeyForType` in
 * `packages/space-chat/src/inventory/tree-source.js`; the two tables are kept
 * in sync (see `INVENTORY_GROUPS`). Any unenumerated or undefined type falls
 * through to the `capabilities` catch-all.
 *
 * @param {string | undefined} formulaType
 * @returns {InventoryGroup}
 */
export const groupForType = formulaType => {
  if (formulaType !== undefined) {
    for (const group of INVENTORY_GROUPS) {
      if (group.types.has(formulaType)) {
        return group;
      }
    }
  }
  return CAPABILITIES_GROUP;
};

/**
 * Resolve a pet name's locator-derived type via the agent's `locate` method.
 * Returns `undefined` when the name has no locator (e.g. immutable tree
 * children) or when the locator lacks a `type` parameter.
 *
 * @param {ERef<{ locate: (petName: string) => Promise<string | undefined> }>} agent
 * @param {string} petName
 * @returns {Promise<string | undefined>}
 */
const typeForPetName = async (agent, petName) => {
  const locator = await E(agent).locate(petName);
  if (typeof locator !== 'string') {
    return undefined;
  }
  try {
    const url = new URL(locator);
    return url.searchParams.get('type') || undefined;
  } catch (_) {
    return undefined;
  }
};

export const list = async ({
  directory,
  follow,
  json,
  verbose,
  grouped,
  type: typeFilter,
}) =>
  withEndoHost({ os, process }, async ({ host: agent }) => {
    await null;
    if (directory !== undefined) {
      const directoryPath = parsePetNamePath(directory);
      agent = E(agent).lookup(directoryPath);
    }
    if (follow) {
      const topic = await E(agent).followNameChanges();
      const iterator = iterateReader(topic);
      if (json) {
        for await (const change of iterator) {
          console.log(JSON.stringify(change));
        }
      } else {
        for await (const change of iterator) {
          if (change.add !== undefined) {
            // The daemon's change event carries `type` directly (newer
            // daemons). When it does not (older daemons) and a `--type`
            // filter is active, fall back to `locate()` so the filter still
            // works — mirroring the snapshot path above and the chat
            // inventory's `onTypeResolved` fallback. Without a filter we
            // skip the round-trip and emit whatever the event provides.
            let { type } = change;
            if (typeFilter !== undefined && type === undefined) {
              type = await typeForPetName(agent, change.add);
            }
            if (typeFilter === undefined || type === typeFilter) {
              const suffix = type ? `\t${type}` : '';
              console.log(`+${change.add}${suffix}`);
            }
          } else if (change.remove !== undefined) {
            console.log(`-${change.remove}`);
          }
        }
      }
      return;
    }

    const petNames = await E(agent).list();

    if (grouped || typeFilter !== undefined) {
      // Resolve types for every pet name in parallel via locate(); the
      // daemon's locator-derived type is the single source of truth.
      const typedNames = await Promise.all(
        petNames.map(async petName => {
          await null;
          return {
            petName,
            type: await typeForPetName(agent, petName),
          };
        }),
      );

      /** @type {Array<{ petName: string, type: string | undefined }>} */
      const filtered =
        typeFilter !== undefined
          ? typedNames.filter(entry => entry.type === typeFilter)
          : typedNames;

      if (grouped) {
        /** @type {Map<string, Array<{ petName: string, type: string | undefined }>>} */
        const byGroup = new Map();
        for (const entry of filtered) {
          const group = groupForType(entry.type);
          const bucket = byGroup.get(group.key) ?? [];
          bucket.push(entry);
          byGroup.set(group.key, bucket);
        }
        for (const group of INVENTORY_GROUPS) {
          const bucket = byGroup.get(group.key);
          if (bucket !== undefined && bucket.length > 0) {
            console.log(`${group.label}:`);
            for (const { petName, type } of bucket.sort((a, b) =>
              a.petName.localeCompare(b.petName),
            )) {
              const suffix = type ? `\t(${type})` : '';
              console.log(`  ${petName}${suffix}`);
            }
          }
        }
      } else if (verbose) {
        // Resolve values in parallel to keep the lookup pipeline open.
        const enriched = await Promise.all(
          filtered.map(async entry => {
            await null;
            return {
              ...entry,
              value: await E(agent).lookup(entry.petName),
            };
          }),
        );
        for (const { petName, value } of enriched) {
          console.log(`${petName}${pad(petName, 20)}${prettyValue(value)}`);
        }
      } else {
        for (const { petName, type } of filtered) {
          const suffix = type ? `\t${type}` : '';
          console.log(`${petName}${suffix}`);
        }
      }
      return;
    }

    for await (const petName of petNames) {
      if (verbose) {
        const val = await E(agent).lookup(petName);
        console.log(`${petName}${pad(petName, 20)}${prettyValue(val)}`);
      } else {
        console.log(petName);
      }
    }
  });
