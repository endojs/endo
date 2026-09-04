{
  description = "Endo monorepo flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    capricorn.url = "path:./packages/capricorn";
  };

  outputs = inputs@{ self, nixpkgs, flake-utils, ... }:
    let
      capricorn = builtins.getFlake (toString ./packages/capricorn);
    in
    {
      # Bubble up subflake outputs
      packages = capricorn.packages;
      apps = capricorn.apps;
      nixosModules = capricorn.nixosModules;
    };
}
