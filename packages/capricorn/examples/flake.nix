{
  description = "Example flake showing how to use Capricorn OCapN server";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # Reference Capricorn from the kumavis/capricorn branch
    # ⚠️ Important: The Nix flake only exists on the kumavis/capricorn branch
    capricorn = {
      url = "github:endojs/endo/kumavis/capricorn?dir=packages/capricorn";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, capricorn }:
    let
      # Supported systems
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];

      # Helper to generate outputs for each system
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      # NixOS system configuration example
      nixosConfigurations.my-server = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          # Import the Capricorn NixOS module
          capricorn.nixosModules.default

          # Your system configuration
          {
            # Enable Capricorn service
            services.capricorn = {
              enable = true;
              storageFile = "/var/lib/capricorn/storage.json";

              # Optional: additional environment variables
              extraEnvironment = {
                NODE_ENV = "production";
              };
            };

            # Other system configuration...
            system.stateVersion = "23.11";
          }
        ];
      };

      # Development shells for each system
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          # Default development shell with Capricorn available
          default = pkgs.mkShell {
            buildInputs = [
              capricorn.packages.${system}.default
              pkgs.nodejs
            ];

            shellHook = ''
              echo "Capricorn OCapN server is available!"
              echo "Run 'capricorn-server' to start the server"
              echo ""
              echo "Environment variables:"
              echo "  CAPRICORN_STORAGE_FILE - Storage file path (default: ~/.capricorn/capricorn-storage.json)"
              echo "  CAPRICORN_ADMIN_SWISSNUM - Admin swissnum for client connections"
              echo "  CAPRICORN_LOCATION - Server location (e.g., 127.0.0.1:64187)"
            '';
          };
        }
      );

      # Make Capricorn package available in this flake's outputs
      packages = forAllSystems (system: {
        default = capricorn.packages.${system}.default;
        capricorn = capricorn.packages.${system}.capricorn;
      });

      # Apps for easy running
      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${capricorn.packages.${system}.default}/bin/capricorn-server";
        };
      });
    };
}
