import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoHost } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Resolve a `<name-or-identifier>` argument into a local formula
 * identifier. When `--identifier` is set, the argument is treated
 * as an already-encoded formula identifier and passed through.
 * Otherwise, the argument is a (possibly-dotted) pet-name path
 * resolved against the current agent via `host.identify`.
 *
 * @param {object} host
 * @param {string} arg
 * @param {boolean} asIdentifier
 */
const resolveIdentifier = async (host, arg, asIdentifier) => {
  if (asIdentifier) {
    return arg;
  }
  const namePath = parsePetNamePath(arg);
  const id = await E(host).identify(...namePath);
  if (id === undefined) {
    throw Error(`No identifier for pet name path ${JSON.stringify(namePath)}`);
  }
  return id;
};

/**
 * Render a `FormulaRecord` as a human-readable block: the formula
 * type as a header, then one row per property. Reference properties
 * are rendered as the property name plus the target identifier in a
 * dim style (in this terminal-targeted view, the dimming is a
 * leading whitespace gutter so output stays grep-friendly).
 *
 * @param {{ type: string, number: string, properties: Record<string, any> }} record
 */
const renderHuman = record => {
  const lines = [];
  lines.push(`${record.type}  ${record.number}`);
  const propertyNames = Object.keys(record.properties).sort();
  for (const name of propertyNames) {
    const property = record.properties[name];
    if (property.kind === 'literal') {
      const value = property.value;
      if (typeof value === 'string') {
        // Strings render directly; multi-line strings are indented.
        const stringLines = value.split('\n');
        if (stringLines.length === 1) {
          lines.push(`  ${name}: ${value}`);
        } else {
          lines.push(`  ${name}:`);
          for (const stringLine of stringLines) {
            lines.push(`    ${stringLine}`);
          }
        }
      } else if (Array.isArray(value)) {
        lines.push(`  ${name}: [${value.map(String).join(', ')}]`);
      } else {
        lines.push(`  ${name}: ${JSON.stringify(value)}`);
      }
    } else if (property.kind === 'reference') {
      lines.push(`  ${name} -> ${property.identifier}`);
    } else if (property.kind === 'reference-list') {
      const entries = property.entries;
      const entryKeys = Object.keys(entries).sort();
      if (entryKeys.length === 0) {
        lines.push(`  ${name}: (empty)`);
      } else {
        lines.push(`  ${name}:`);
        for (const key of entryKeys) {
          lines.push(`    ${key} -> ${entries[key]}`);
        }
      }
    }
  }
  if (propertyNames.length === 0) {
    lines.push('  (no formula-level properties)');
  }
  return lines.join('\n');
};

/**
 * @param {object} params
 * @param {string} params.nameOrIdentifier - The argument from the command line.
 * @param {boolean} params.asIdentifier - --identifier flag.
 * @param {boolean} params.asJson - --json flag.
 */
export const inspect = async ({ nameOrIdentifier, asIdentifier, asJson }) =>
  withEndoHost({ os, process }, async ({ host }) => {
    const identifier = await resolveIdentifier(
      host,
      nameOrIdentifier,
      asIdentifier,
    );
    const record = await E(E(host).diagnostics()).getFormula(identifier);
    if (asJson) {
      console.log(JSON.stringify(record, null, 2));
    } else {
      console.log(renderHuman(record));
    }
  });
