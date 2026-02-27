# Endo JavaScript Framework

Endo is a JavaScript framework for powerful plugin systems and supply chain attack resistance. It provides tools for confinement, communication, and concurrency built on Hardened JavaScript (SES). This monorepo contains numerous packages including the core SES implementation, CLI tools, daemon, and various utility packages.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Prerequisites and Setup
- **Node.js**: Requires Node.js >= 16. Tested with Node.js v20.19.4.
- **Package Manager**: Uses Yarn 4.9.1 (managed via corepack)
- **Repository Structure**: Yarn workspaces monorepo with 44 packages

### Bootstrap, Build, and Test Process
Execute these commands in exact order:

```bash
# 1. Enable corepack for Yarn version management
corepack enable

# 2. Install dependencies
yarn install --immutable
# Takes: ~3 minutes. NEVER CANCEL. Set timeout to 10+ minutes.

# 3. Install benchmark engines (optional - may fail due to firewall)
yarn workspace @endo/benchmark run install-engines
# Expected: FAILS due to firewall restrictions blocking GitHub API access
# Error message: "FetchError: invalid json response body...Blocked by..."
# This is normal - continue without engines for XS/V8 tests

# 4. Build all packages  
yarn build
# Takes: ~12 seconds. NEVER CANCEL. Set timeout to 5+ minutes.

# 5. Run tests (core packages work, benchmark fails without engines)
yarn workspace @endo/base64 run test    # Quick test: ~1 second
yarn workspace ses run test             # Core SES test: ~29 seconds. NEVER CANCEL.
yarn workspace @endo/cli run test       # CLI tests: ~50 seconds. NEVER CANCEL.
yarn workspace @endo/daemon run test    # Daemon tests: ~28 seconds. NEVER CANCEL.
```

### Linting and Code Quality
```bash
# Run all linting (prettier + eslint)
yarn lint
# Takes: ~48 seconds. NEVER CANCEL. Set timeout to 10+ minutes.

# Format code
yarn format

# Build documentation
yarn docs
# Takes: ~3 minutes. NEVER CANCEL. Set timeout to 10+ minutes.
```

## Validation Scenarios

### Essential Testing Workflow
After making any changes, ALWAYS validate with these scenarios:

1. **Build and Core Tests**:
   ```bash
   yarn build
   yarn workspace ses run test
   ```


3. **Linting**:
   ```bash
   yarn lint
   ```

### Expected Failure Scenarios
These are known limitations to document, not fix:

- **Benchmark Engine Installation**: `yarn workspace @endo/benchmark run install-engines` FAILS due to firewall blocking GitHub API access to download XS and V8 engines
- **Full Test Suite**: `yarn test` FAILS because it includes benchmark tests that require the missing engines
- **XS Tests**: `yarn test:xs` requires XS engine installation which fails in restricted environments

## Key Projects and Packages

### Local Object Capability Foundations
- **`ses`**: Secure EcmaScript (Hardened JavaScript) - the foundation of Endo
- **`lockdown`**: Hardens JavaScript environments  
- **`compartment-mapper`**: Map `node_modules` and construct compartments for packages, for bundling, archiving, and executing confined Node.js-style applications

### Remote Object Capability Communication
- **`marshal`**: Serialization for capability-secure communication
- **`patterns`**: Pattern matching utilities
- **`eventual-send`**: Sending eventual messages to target objects
- **`exo`**: Creating target objects for eventual messages
- **`captp`**: Example capability transfer protocol
- **`ocapn`**: Example capability transfer protocol with three-party-hand-off

### Canonical Example Platform
- **`cli`**: Command-line interface for Endo daemon management
- **`daemon`**: Persistent host for managing guest programs in hardened workers

### Communication & Capabilities
- **`captp`**: Capability Transfer Protocol for distributed object communication
- **`eventual-send`**: Handled Promise API for async messaging
- **`far`**: Remote object capabilities

### Build & Bundle Tools
- **`bundle-source`**: Bundles JavaScript sources for secure execution
- **`import-bundle`**: Imports bundled code securely

### Utilities
- **`base64`**: Base64 encoding/decoding
- **`zip`**: ZIP file utilities  
- **`stream`**: Stream processing utilities

## Common Tasks

### Running Individual Package Tests
For example
```bash
# Test specific packages (these work reliably)
yarn workspace @endo/base64 run test
yarn workspace ses run test
yarn workspace @endo/cli run test  
yarn workspace @endo/daemon run test
yarn workspace @endo/captp run test
yarn workspace @endo/marshal run test
```

### Working with the CLI/Daemon
```bash
# Check daemon status
./packages/cli/bin/endo ping

# Start daemon (runs in background)
./packages/cli/bin/endo start

# Basic evaluation
./packages/cli/bin/endo eval 'console.log("Hello, Endo!")'

# List available capabilities
./packages/cli/bin/endo list

# Stop daemon
./packages/cli/bin/endo stop

# Show where Endo stores data
./packages/cli/bin/endo where state
./packages/cli/bin/endo where log
```

### Creating New Packages
```bash
# Use the provided script
./scripts/create-package.sh my-package-name
```

### Release Process
```bash
# Generate changelogs
yarn lerna version --no-push --conventional-graduate --no-git-tag-version

# After review and merge
yarn lerna publish from-package
```

## Directory Structure

```
endo/
├── .github/           # GitHub workflows and templates
├── packages/          # packages in the monorepo
├── scripts/           # Build and maintenance scripts  
├── browser-test/      # Browser compatibility tests
├── package.json       # Root workspace configuration
├── lerna.json         # Lerna configuration for releases
├── tsconfig*.json     # TypeScript configurations
└── yarn.lock          # Dependency lock file
```

## Timeout Guidelines and Build Times

**CRITICAL**: Always use these minimum timeout values to prevent premature cancellation:

- **`yarn install --immutable`**: 10+ minutes (actual: ~3 minutes)
- **`yarn build`**: 5+ minutes (actual: ~12 seconds)
- **`yarn workspace ses run test`**: 5+ minutes (actual: ~29 seconds)
- **`yarn workspace @endo/cli run test`**: 10+ minutes (actual: ~50 seconds)  
- **`yarn workspace @endo/daemon run test`**: 5+ minutes (actual: ~28 seconds)
- **`yarn lint`**: 10+ minutes (actual: ~48 seconds)
- **`yarn docs`**: 10+ minutes (actual: ~3 minutes)

**NEVER CANCEL** any build or test command. Builds may take longer than expected, especially on slower systems.

## Known Issues and Workarounds

1. **Engine Installation Failure**: The benchmark engines (XS, V8) cannot be installed due to firewall restrictions. This is expected and does not affect core functionality.

2. **Test Suite Limitations**: Full `yarn test` fails due to benchmark package requiring missing engines. Use individual package testing instead.

3. **Documentation Warnings**: `yarn docs` produces warnings about missing references and unresolved links. These are non-fatal and the documentation still generates successfully.

4. **Windows Compatibility**: The CI workflow notes that Windows testing has been disabled due to flaky tests, though the core functionality should work.