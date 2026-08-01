// @ts-nocheck
// The XS bootstrap bundles under `rust/endo/xsnap/src/` are generated
// and gitignored, and `rust/endo/xsnap/src/lib.rs` `include_str!`s
// them, so nothing in a normal checkout ties an artifact to the entry
// point it came from.  In practice the artifacts have been copied in
// by hand from other worktrees (see PR #882's description), which is
// exactly how a stale bundle survives.
//
// These tests close that: they regenerate each bundle from its entry
// point and, when the artifact is on disk, assert byte identity.
// Regenerating also proves the entry point still bundles at all,
// which is the regression that made these generators necessary — a
// Node-only import creeping into the XS graph.
import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'node:fs';
import url from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';

import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

const readPowers = makeReadPowers({ fs, url, crypto, path });

const packageRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(packageRoot, '../..');
const xsnapSrc = path.join(repoRoot, 'rust/endo/xsnap/src');

// entry point -> generator -> artifact `lib.rs` includes.
const bundles = [
  {
    label: 'worker bootstrap',
    entry: 'src/bus-worker-xs.js',
    generator: 'scripts/bundle-bus-worker-xs.mjs',
    artifact: 'worker_bootstrap.js',
    rustConst: 'WORKER_BOOTSTRAP',
  },
  {
    label: 'SES boot',
    entry: 'src/bus-worker-xs-ses-boot.js',
    generator: 'scripts/bundle-bus-worker-xs-ses-boot.mjs',
    artifact: 'ses_boot.js',
    rustConst: 'SES_BOOT',
  },
];

for (const bundle of bundles) {
  test(`${bundle.label}: the entry point bundles for XS`, async t => {
    const entryUrl = url.pathToFileURL(
      path.join(packageRoot, bundle.entry),
    ).href;
    const text = await makeBundle(readPowers, entryUrl, {});
    t.true(text.length > 0);
    // `makeBundle` resolves every import, so a Node-only module
    // reaching the retained graph fails above rather than here; this
    // catches a `node:` specifier that survived as a literal.
    t.false(/require\(['"]node:/.test(text));
  });

  test(`${bundle.label}: the generator writes what lib.rs includes`, async t => {
    const generator = await fs.promises.readFile(
      path.join(packageRoot, bundle.generator),
      'utf8',
    );
    t.true(
      generator.includes(bundle.entry.replace(/^src\//, '../src/')),
      `${bundle.generator} should bundle ${bundle.entry}`,
    );
    t.true(
      generator.includes(bundle.artifact),
      `${bundle.generator} should write ${bundle.artifact}`,
    );
    const libRs = await fs.promises.readFile(
      path.join(xsnapSrc, 'lib.rs'),
      'utf8',
    );
    t.true(
      libRs.includes(
        `pub const ${bundle.rustConst}: &str = include_str!("${bundle.artifact}");`,
      ),
      `lib.rs should include_str! ${bundle.artifact} as ${bundle.rustConst}`,
    );
  });

  test(`${bundle.label}: the generated artifact is not stale`, async t => {
    const artifactPath = path.join(xsnapSrc, bundle.artifact);
    if (!fs.existsSync(artifactPath)) {
      // A clean checkout has not run the generators yet; `cargo build`
      // does that first.  Nothing to compare against.
      t.pass(`${bundle.artifact} not generated yet`);
      return;
    }
    const entryUrl = url.pathToFileURL(
      path.join(packageRoot, bundle.entry),
    ).href;
    const fresh = await makeBundle(readPowers, entryUrl, {});
    const onDisk = await fs.promises.readFile(artifactPath, 'utf8');
    t.is(
      onDisk,
      fresh,
      `${bundle.artifact} does not match a fresh bundle of ${bundle.entry}; regenerate it with \`node packages/daemon/${bundle.generator}\``,
    );
  });
}
