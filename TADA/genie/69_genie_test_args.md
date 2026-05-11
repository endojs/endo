# Genie integration test improvement

Rework `packages/genie/test/integration.sh` args parsing:

1. [x] shift the current "maybe an env file" positional arg to be a `-f <env_file>` option

2. [x] add a `-E KEY VAL` or `-E KEY=VAL` option for setting values directly without an env file

3. [x] update the `test:integration` script call to use `-E ...` form and run `GENIE_TEST=test/scenarios/workspace-tool.sh` with a basic small model
