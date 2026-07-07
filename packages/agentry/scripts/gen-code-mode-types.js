// @ts-check
/// <reference types="ses"/>

/**
 * Build-time codegen for the per-exo code-mode global type declarations.
 *
 * Composes the per-exo extractors (`code-mode-git-extract.js`,
 * `code-mode-fs-extract.js`), each of which pairs a source with the generic
 * renderer it needs, and writes one checked-in runtime artifact per exo:
 *
 *   - `src/execute/git-types.js` (git, gitReadOnly)
 *   - `src/execute/fs-types.js`  (workspace)
 *
 * Run with: `yarn workspace agentry gen:code-mode-types`
 *
 * `test/code-mode-types.test.js` is the divergence gate: it re-runs the same
 * extraction and fails if a checked-in artifact is stale, so a change to any
 * source (the exo-git types, the FS guards) or to a renderer must be
 * regenerated and committed.
 *
 * `typescript` and `@endo/patterns` are dev dependencies and are only used here
 * and in the gate, never at agentry runtime: the artifacts are plain checked-in
 * data.
 */

import '@endo/init';

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildGitTypeDeclarations } from './code-mode-git-extract.js';
import { buildFsTypeDeclarations } from './code-mode-fs-extract.js';

/**
 * @param {string} descriptorFile The per-exo runtime descriptor module that
 *   consumes this artifact (e.g. `git.js`).
 * @param {string} sourceDoc Provenance note for the generated file header.
 * @returns {string}
 */
const header = (descriptorFile, sourceDoc) => `// @ts-check
/// <reference types="ses"/>

/**
 * GENERATED FILE - do not edit by hand.
 *
 * Regenerate with: yarn workspace agentry gen:code-mode-types
 *
 * Source of truth:
${sourceDoc}
 *
 * The generic extraction and rendering live in
 * scripts/code-mode-type-extract.js; this exo's source configuration lives in
 * its scripts/code-mode-*-extract.js extractor. The divergence gate in
 * test/code-mode-types.test.js keeps this artifact fresh.
 *
 * Each entry is consumed by formatGlobalDeclarations in execute/globals.js via
 * the per-exo descriptor in execute/${descriptorFile}:
 * \`aux\` is the supporting \`type\` aliases, \`body\` is the object type spliced
 * after the dynamic \`declare const <name>:\`.
 */
`;

/**
 * @param {string} s
 * @returns {string}
 */
const guardTemplate = s => {
  if (s.includes('`') || s.includes('${')) {
    throw new Error('generated declaration contains a template-literal sigil');
  }
  return s;
};

/**
 * @param {Record<string, { aux: string, body: string }>} declarations
 * @returns {string}
 */
const renderEntries = declarations =>
  Object.entries(declarations)
    .map(
      ([key, { aux, body }]) =>
        `  ${key}: {\n    aux: \`${guardTemplate(aux)}\`,\n    body: \`${guardTemplate(
          body,
        )}\`,\n  },`,
    )
    .join('\n');

/**
 * @param {object} artifact
 * @param {string} artifact.outPath Path relative to this script's directory.
 * @param {string} artifact.exportName The `export const <name>` to emit.
 * @param {string} artifact.descriptorFile The per-exo runtime descriptor module
 *   that consumes this artifact.
 * @param {string} artifact.sourceDoc Provenance note for the header.
 * @param {Record<string, { aux: string, body: string }>} artifact.declarations
 */
const writeArtifact = ({
  outPath,
  exportName,
  descriptorFile,
  sourceDoc,
  declarations,
}) => {
  const outUrl = new URL(outPath, import.meta.url);
  const body = `${header(descriptorFile, sourceDoc)}
export const ${exportName} = harden({
${renderEntries(declarations)}
});
harden(${exportName});
`;
  writeFileSync(fileURLToPath(outUrl), body);
  console.error(
    `wrote ${fileURLToPath(outUrl)} (${Object.keys(declarations).join(', ')})`,
  );
};

writeArtifact({
  outPath: '../src/execute/git-types.js',
  exportName: 'gitCodeModeTypeDeclarations',
  descriptorFile: 'git.js',
  sourceDoc: ` *   - git / gitReadOnly: packages/exo-git/src/types.ts (the \`EndoGit\`
 *     type alias), printed by the typescript compiler API
 *     (TypeScript-canonical).`,
  declarations: buildGitTypeDeclarations(),
});

writeArtifact({
  outPath: '../src/execute/fs-types.js',
  exportName: 'fsCodeModeTypeDeclarations',
  descriptorFile: 'fs.js',
  sourceDoc: ` *   - workspace: the platform/fs/extended interface guards
 *     (\`FilesystemInterface\` and the remotables it reaches), the richest
 *     available source since the FS \`.d.ts\` is a stub.`,
  declarations: buildFsTypeDeclarations(),
});
