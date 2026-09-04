# Capricorn Nix Flake

This directory contains a Nix flake for building and deploying the Capricorn OCapN server.

**⚠️ Important:** 
- The Nix flake is only available on the `kumavis/capricorn` branch. It will not work on other branches.
- All Nix commands require the `--impure` flag because the build needs network access to install Yarn workspace dependencies.

## Quick Start

### Run Directly (No Installation)

```bash
nix run --impure github:endojs/endo/kumavis/capricorn?dir=packages/capricorn
```

**Note:** The `--impure` flag is required because the build needs network access to install Yarn workspace dependencies.

The server will start and display:
- TCP location for OCapN connections
- WebSocket location for browser clients
- Admin facet swissnum (save this - you'll need it to register routes)

### Install as NixOS System Service

**Step 1:** Add to your system's `flake.nix`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    
    capricorn = {
      url = "github:endojs/endo/kumavis/capricorn?dir=packages/capricorn";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, capricorn, ... }: {
    nixosConfigurations.your-hostname = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ./configuration.nix
        capricorn.nixosModules.default
      ];
    };
  };
}
```

**Step 2:** Enable in `configuration.nix`:

```nix
{
  services.capricorn.enable = true;
}
```

**Step 3:** Deploy:

```bash
sudo nixos-rebuild switch --impure --flake .#your-hostname
```

**Note:** The `--impure` flag is required for the initial build.

**Step 4:** Check status:

```bash
sudo systemctl status capricorn
sudo journalctl -u capricorn -f
```

### Install to User Profile

```bash
nix profile install --impure github:endojs/endo/kumavis/capricorn?dir=packages/capricorn
capricorn-server
```

**Note:** The `--impure` flag is required for the initial build.

## Configuration

### Basic Configuration

```nix
services.capricorn = {
  enable = true;
  storageFile = "/var/lib/capricorn/storage.json";  # default
  user = "capricorn";  # default
  group = "capricorn";  # default
};
```

### Advanced Configuration

```nix
services.capricorn = {
  enable = true;
  
  # Storage location
  storageFile = "/var/lib/capricorn/storage.json";
  
  # Load secrets from file (systemd EnvironmentFile format)
  environmentFile = "/run/secrets/capricorn-env";
  
  # Additional environment variables
  extraEnvironment = {
    NODE_ENV = "production";
    # DEBUG = "*";  # Uncomment for verbose logging
  };
};
```

Create `/run/secrets/capricorn-env`:

```bash
CAPRICORN_ADMIN_SWISSNUM=your_secret_swissnum_here
CAPRICORN_LOCATION=127.0.0.1:64187
```

### Environment Variables

- `CAPRICORN_STORAGE_FILE` - Path to JSON storage file (default: `~/.capricorn/capricorn-storage.json`)
- `CAPRICORN_ADMIN_SWISSNUM` - Admin swissnum for client authentication
- `CAPRICORN_LOCATION` - Server address for client connections (e.g., `127.0.0.1:64187`)

## Usage

### Managing the Service

```bash
# Status and logs
sudo systemctl status capricorn
sudo journalctl -u capricorn -f

# Control
sudo systemctl start capricorn
sudo systemctl stop capricorn
sudo systemctl restart capricorn
```

### Getting the Admin Swissnum

Find the admin swissnum from the logs:

```bash
sudo journalctl -u capricorn | grep "Admin facet swissnum"
```

Output example:
```
Jan 15 10:30:45 hostname capricorn[1234]: Admin facet swissnum: h5xwz4k41pk
```

Save this swissnum - you need it to register routes.

### Connecting Clients

```bash
export CAPRICORN_ADMIN_SWISSNUM=h5xwz4k41pk
export CAPRICORN_LOCATION=127.0.0.1:64187
node register.js
```

## Updating

### Update from Git

When changes are pushed to the `kumavis/capricorn` branch:

```bash
# NixOS systems
sudo nixos-rebuild switch --impure --flake .#your-hostname --refresh

# User profile installations
nix profile upgrade --impure '.*capricorn.*' --refresh
```

The `--refresh` flag forces Nix to refetch from Git. The `--impure` flag is needed for the build phase.

### Force Complete Rebuild

```bash
rm flake.lock
sudo nixos-rebuild switch --impure --flake .#your-hostname
```

## Examples

See the `examples/` directory:

- **`examples/flake.nix`** - Complete flake configuration
- **`examples/nixos-configuration.nix`** - NixOS module configuration
- **`examples/test-installation.sh`** - Installation verification script

Run the test script:

```bash
./examples/test-installation.sh
```

## Troubleshooting

### Service Won't Start

Check logs and permissions:

```bash
sudo journalctl -u capricorn -n 100
ls -la /var/lib/capricorn
sudo chown -R capricorn:capricorn /var/lib/capricorn
```

### Build Failures

Build with verbose output:

```bash
nix build --impure .#capricorn --print-build-logs
```

The `--impure` flag is required because the build downloads dependencies from the network.

### Connection Issues

```bash
# Verify service is running
sudo systemctl status capricorn

# Check listening ports
sudo ss -tlnp | grep node

# Test local connection
curl http://127.0.0.1:64187 || echo "Not responding"
```

### Reset Storage

```bash
sudo systemctl stop capricorn
sudo rm /var/lib/capricorn/capricorn-storage.json
sudo systemctl start capricorn
sudo journalctl -u capricorn | grep "Admin facet swissnum"
```

## Security

The systemd service includes hardening:

- `NoNewPrivileges=true` - Cannot gain new privileges
- `PrivateTmp=true` - Isolated /tmp directory
- `ProtectSystem=strict` - Read-only filesystem except state directory
- `ProtectHome=true` - Home directories inaccessible
- `RestrictAddressFamilies` - Limited network protocols
- `SystemCallFilter` - Restricted system calls

For production:
1. Use `environmentFile` for secrets
2. Set up firewall rules if exposing externally
3. Backup the storage file regularly
4. Monitor service logs

## FAQ

**Q: Can I use a different branch?**

No. The Nix flake only exists on `kumavis/capricorn`. Other branches don't have the `flake.nix` file.

**Q: Can I use this with a local repository?**

Yes, use a path reference:

```nix
capricorn.url = "git+file:///path/to/endo?dir=packages/capricorn";
```

Make sure you're on the `kumavis/capricorn` branch.

**Q: Does this work on macOS?**

Yes for the package, but systemd service is NixOS-only. On macOS:

```bash
nix run github:endojs/endo/kumavis/capricorn?dir=packages/capricorn
```

**Q: How do I run multiple instances?**

Create multiple service definitions with different storage files and ports.

**Q: Can I customize the build?**

Yes:

```nix
services.capricorn.package = pkgs.capricorn.override {
  # customizations here
};
```

**Note:** Remember to use `--impure` flag when rebuilding.

## Resources

- **Main Capricorn Docs:** [README.md](./README.md)
- **Nix Flakes Manual:** https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake.html
- **NixOS Manual:** https://nixos.org/manual/nixos/stable/
- **Endo Repository:** https://github.com/endojs/endo

## License

Apache-2.0 - See [LICENSE](./LICENSE) for details.