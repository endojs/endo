#!/bin/sh
# Multi-engine bench runner for @endo/hex.
#
# Bundles `test/encode.bench.js` and `test/decode.bench.js` (each as a
# self-contained IIFE that pulls in @endo/xorshift and the local
# polyfill via rollup), then runs each bundle on every engine eshost
# knows about (typically xs and v8 — see `packages/benchmark/`).
#
# Prerequisites (matching @endo/benchmark):
#   yarn workspace @endo/benchmark install-engines
#
# Usage:
#   ./test/run-benches.sh           # both encode + decode, all engines
#   ./test/run-benches.sh encode    # encode bench only
#   ./test/run-benches.sh decode    # decode bench only

set -e

cd "$(dirname "$0")/.."

# Locate eshost and engines from the @endo/benchmark sibling, which is
# already wired up to esvu-managed xs / v8 binaries.
BENCHMARK_DIR="$(cd ../benchmark && pwd)"
ESHOST="${BENCHMARK_DIR}/node_modules/.bin/eshost"
ROLLUP="${BENCHMARK_DIR}/node_modules/.bin/rollup"

if [ ! -x "$ESHOST" ] || [ ! -x "$ROLLUP" ]; then
  echo "eshost / rollup not found in @endo/benchmark/node_modules/.bin/" >&2
  echo "Run \`yarn workspace @endo/benchmark install\` first." >&2
  exit 1
fi

if [ ! -f "$HOME/.esvu/bin/xs" ] || [ ! -f "$HOME/.esvu/bin/v8" ]; then
  echo "xs and/or v8 not found in \$HOME/.esvu/bin." >&2
  echo "Run \`yarn workspace @endo/benchmark install-engines\` first." >&2
  exit 127
fi

mkdir -p dist

bundle_and_run() {
  bench="$1"  # "encode" or "decode"
  in="test/${bench}.bench.js"
  out="dist/${bench}.bench.bundle.js"

  cat >"dist/${bench}.bench.rollup.config.mjs" <<EOF
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: '${in}',
  output: {
    file: '${out}',
    format: 'iife',
    name: 'bench_${bench}',
    sourcemap: false,
  },
  plugins: [nodeResolve()],
};
EOF

  echo "==> rollup ${bench}"
  "$ROLLUP" -c "dist/${bench}.bench.rollup.config.mjs"

  echo "==> ${bench} bench on xs / v8"
  "$ESHOST" -h xs,v8 "$out"
}

case "${1:-all}" in
  encode) bundle_and_run encode ;;
  decode) bundle_and_run decode ;;
  all)
    bundle_and_run encode
    echo
    bundle_and_run decode
    ;;
  *)
    echo "usage: $0 [encode|decode|all]" >&2
    exit 2
    ;;
esac
