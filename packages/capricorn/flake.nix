{
  description = "Capricorn OCapN Server";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, repoRoot, ... }:
    let
      # Define the NixOS module inside a let so it can access self.packages later
      nixosModule = { config, pkgs, lib, ... }:
        with lib;
        let
          cfg = config.services.capricorn;
        in {
          options.services.capricorn = {
            enable = mkEnableOption "Capricorn OCapN Server";

            # port = mkOption {
            #   type = types.port;
            #   default = 3030;
            #   description = "Port to listen on for WebSocket connections.";
            # };

            dataDir = mkOption {
              type = types.path;
              default = "/var/lib/capricorn";
              description = "Directory to store saved documents.";
            };
          };

          config = mkIf cfg.enable {
            users.users.capricorn = {
              isSystemUser = true;
              group = "capricorn";
              home = cfg.dataDir;
            };
            users.groups.capricorn = {};

            systemd.services.capricorn = {
              description = "Capricorn OCapN Server";
              after = [ "network.target" ];
              wantedBy = [ "multi-user.target" ];

              environment = {
                PORT = toString cfg.port;
                DATA_DIR = cfg.dataDir;
                NODE_ENV = "production";
                YARN_CACHE_FOLDER = "${cfg.dataDir}/.yarn";
              };

              serviceConfig = {
                Type = "simple";
                ExecStart = "${pkgs.capricornPackage}/bin/capricorn";
                WorkingDirectory = cfg.dataDir;
                Restart = "always";
                RestartSec = "5s";

                User = "capricorn";
                Group = "capricorn";

                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectSystem = "full";
                ProtectHome = true;
                ReadWritePaths = [ cfg.dataDir ];
              };
            };

            systemd.tmpfiles.rules = [
              "d ${cfg.dataDir} 0755 capricorn capricorn -"
            ];
          };
        };
    in
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Define the package used by both nix run and the NixOS module
        capricornPackage = pkgs.writeShellApplication {
          name = "capricorn";
          runtimeInputs = [ pkgs.nodejs_20 pkgs.coreutils ];
          text = ''
            set -euo pipefail

            # Run from the repo root so Yarn sees all workspaces
            # cd ${repoRoot}
            echo $PWD
            ls -la

            echo "Using Node $(node --version)"

            export COREPACK_HOME="$HOME/.cache/corepack"
            corepack prepare yarn@4.7.0 --activate
            echo "Using Yarn $(yarn --version)"

            yarn workspaces focus capricorn --all --frozen-lockfile --non-interactive
            exec yarn workspace capricorn start "$@"
          '';
        };
      in
      {
        packages.default = capricornPackage;

        # Expose the package for the NixOS module to use
        nixosModules.default = { config, pkgs, ... }: {
          imports = [ nixosModule ];
          _module.args.pkgs.capricornPackage = capricornPackage;
        };

        apps.capricorn = {
          type = "app";
          program = "${capricornPackage}/bin/capricorn";
        };
      }
    );
}
