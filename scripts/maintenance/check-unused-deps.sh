#!/bin/bash

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
REPORT_FILE=$(mktemp)
trap 'rm -f "$REPORT_FILE"' EXIT

cd "$REPO_ROOT"

yarn dlx -q -p knip -p typescript -p @types/node knip \
  --config "$SCRIPT_DIR/knip.json" \
  --reporter json \
  --include dependencies \
  "$@" >"$REPORT_FILE"

node -e '
  const fs = require("node:fs");
  const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const rows = [];
  for (const issue of report.issues || []) {
    for (const dep of issue.dependencies || []) {
      rows.push(`${dep.name}  ${issue.file}:${dep.line}:${dep.col}`);
    }
  }
  if (rows.length === 0) {
    console.log("Unused dependencies (0)");
    process.exit(0);
  }
  console.log(`Unused dependencies (${rows.length})`);
  for (const row of rows) console.log(row);
  process.exit(1);
' "$REPORT_FILE"
