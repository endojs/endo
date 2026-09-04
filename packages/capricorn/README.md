# Capricorn

This `@endo/capricorn` package is an OCapN server for making OCapN functions that perform web requests.

See the `register.js` and `fn-caller.js` examples for how to interact with the server as a client.

## Installation with Nix

**⚠️ Important:** The Nix flake is only available on the `kumavis/capricorn` branch.

Run directly without installing:
```bash
nix run --impure github:endojs/endo/kumavis/capricorn?dir=packages/capricorn
```

**Note:** The `--impure` flag is required because the build needs network access to install Yarn workspace dependencies.

Or install as a NixOS systemd service - see [README_NIX.md](./README_NIX.md) for complete instructions.
