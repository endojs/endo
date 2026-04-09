#! /bin/bash
# Smoke-test the ts-node-pack publish path against a local Verdaccio
# registry. Runs the full `yarn release:npm` flow (which internally
# calls `yarn pack:all` + `npm publish` per tarball) pointed at a
# disposable Verdaccio instance, then installs a representative subset
# of the published packages into a fresh consumer project and imports
# them under SES lockdown.
#
# Usage: scripts/smoketest-publishing.sh
#
# Requires network access for the first `npx verdaccio` / `npx
# npm-cli-login` fetch. The registry itself runs offline (no uplinks).

set -ueo pipefail

thisdir=$(cd -- "$(dirname "$0")" > /dev/null && pwd)
ROOT=$(cd "$thisdir/.." && pwd)

# Isolate npm / yarn state to a per-run HOME so the smoketest cannot
# stomp on the developer's ~/.npmrc or leave auth tokens behind.
REGISTRY_HOME=$(mktemp -d -t endo-smoketest-publishing.XXXXX)
export HOME="$REGISTRY_HOME"
# Pick a free TCP port so a stray Verdaccio on the conventional 4873 can't
# collide with us (and vice versa — we never stomp on an unrelated instance).
REGISTRY_PORT=$(node -e '
  const s = require("net").createServer();
  s.listen(0, () => { console.log(s.address().port); s.close(); });
')
REGISTRY_URL="http://localhost:$REGISTRY_PORT"

cleanup() {
  if [ -f "$REGISTRY_HOME/verdaccio.pid" ]; then
    echo "smoketest-publishing: stopping Verdaccio"
    kill "$(cat "$REGISTRY_HOME/verdaccio.pid")" 2>/dev/null || true
  fi
  rm -rf "$REGISTRY_HOME"
}
trap cleanup EXIT

# Write a Verdaccio config that disables the default npmjs.org uplink.
# We must publish real @endo versions that already exist upstream; with
# the uplink enabled, Verdaccio proxies the read and rejects the publish
# as "version already published" against the public registry's state.
# Offline-only also guarantees that a misconfigured test cannot leak
# a package to the real registry.
cat > "$REGISTRY_HOME/verdaccio.yaml" <<EOF
storage: $REGISTRY_HOME/storage
auth:
  htpasswd:
    file: $REGISTRY_HOME/htpasswd
    max_users: 1000
uplinks: {}
packages:
  '**':
    access: \$all
    publish: \$authenticated
    unpublish: \$authenticated
log:
  type: stdout
  format: pretty
  level: warn
EOF

echo "smoketest-publishing: starting Verdaccio (HOME=$REGISTRY_HOME)"
(
  cd "$REGISTRY_HOME"
  : > verdaccio.log
  nohup npx --yes verdaccio@^6 --config "$REGISTRY_HOME/verdaccio.yaml" \
    --listen "$REGISTRY_PORT" &> verdaccio.log &
  echo $! > verdaccio.pid
  # Block until verdaccio prints its "http address" line to the log.
  grep -q 'http address' <(tail -f verdaccio.log)
)

# We do NOT globally `export npm_config_registry`. That would redirect
# the next `npx npm-cli-login` at our empty local registry and fail with
# E404 trying to fetch `npm-cli-login` itself. Instead we scope the
# override to just the publish command below, where we want it.

# Create a disposable publish user. Verdaccio's default auth plugin
# (htpasswd) accepts new users via npm's adduser endpoint, which
# npm-cli-login automates non-interactively. `-r` pins it at our local
# Verdaccio regardless of the ambient npm config.
echo "smoketest-publishing: creating disposable publish user"
npx --yes npm-cli-login@^1 \
  -u smoketest -p smoketest -e smoketest@example.com \
  -r "$REGISTRY_URL" --quotes

# Sanity: confirm we are authenticated against the local registry.
npm whoami --registry "$REGISTRY_URL"

# Run the real release flow. `release:npm` calls `pack:all` (which
# rebuilds dist/ via ts-node-pack) then `npm publish` for each .tgz;
# inlining `npm_config_registry` redirects every publish inside this
# one command to Verdaccio without leaking into the surrounding shell.
echo "smoketest-publishing: running 'yarn release:npm'"
(
  cd "$ROOT"
  npm_config_registry="$REGISTRY_URL" yarn release:npm
)

# Install a representative subset into a throwaway consumer and exercise
# it at runtime. Using `npm install <name>` (not `<path>`) forces npm to
# resolve each package from the registry, which is the true end-to-end
# check: it proves the published manifests, `workspace:` dep resolution,
# and dependency graph are self-consistent within the registry.
CONSUMER="$REGISTRY_HOME/consumer"
mkdir -p "$CONSUMER"
cat > "$CONSUMER/package.json" <<'EOF'
{
  "name": "smoke-consumer",
  "private": true,
  "type": "module"
}
EOF
echo "registry=$REGISTRY_URL" > "$CONSUMER/.npmrc"

echo "smoketest-publishing: installing packages from local registry"
(
  cd "$CONSUMER"
  npm install --no-audit --no-fund \
    @endo/init \
    @endo/patterns \
    @endo/eventual-send \
    @endo/exo \
    @endo/pass-style \
    @endo/marshal
)

echo "smoketest-publishing: running SES lockdown + runtime checks"
cat > "$CONSUMER/smoke.mjs" <<'EOF'
import '@endo/init';
const p = await import('@endo/patterns');
const x = await import('@endo/exo');
const m = await import('@endo/marshal');
const { M, matches } = p;
const { makeExo } = x;
const guard = M.interface('Foo', { greet: M.call().returns(M.string()) });
const obj = makeExo('foo', guard, { greet: () => 'hi' });
if (obj.greet() !== 'hi') {
  throw new Error(`makeExo.greet returned ${obj.greet()}, expected 'hi'`);
}
if (matches(42, M.number()) !== true) {
  throw new Error('matches(42, M.number()) was not true');
}
if (Object.keys(m).length === 0) {
  throw new Error('@endo/marshal has no exports');
}
console.log('smoketest-publishing: runtime checks passed');
EOF
node "$CONSUMER/smoke.mjs"

echo "smoketest-publishing: SUCCESS"
