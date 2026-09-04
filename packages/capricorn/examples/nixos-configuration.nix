# Example NixOS configuration for Capricorn OCapN server
#
# This file shows how to integrate the Capricorn flake into your NixOS system.
# You can use this as a reference for your own configuration.

{ config, pkgs, ... }:

{
  # Import the Capricorn module from the flake
  # This assumes you've added capricorn to your flake inputs
  imports = [
    # If using flakes, the module is imported automatically
    # Otherwise, you would import it here
  ];

  # Enable and configure the Capricorn service
  services.capricorn = {
    enable = true;

    # Storage file location (default: /var/lib/capricorn/capricorn-storage.json)
    storageFile = "/var/lib/capricorn/capricorn-storage.json";

    # User and group (defaults to capricorn:capricorn)
    user = "capricorn";
    group = "capricorn";

    # State directory (default: /var/lib/capricorn)
    stateDirectory = "/var/lib/capricorn";

    # Optional: Load sensitive configuration from a file
    # This file should contain environment variables like:
    #   CAPRICORN_ADMIN_SWISSNUM=your_admin_swissnum
    #   CAPRICORN_LOCATION=127.0.0.1:64187
    environmentFile = null; # or "/run/secrets/capricorn-env"

    # Optional: Additional environment variables
    extraEnvironment = {
      # Set logging level if needed
      # DEBUG = "*";

      # Custom Node.js options
      # NODE_OPTIONS = "--max-old-space-size=4096";
    };

    # Optional: Use a custom package build
    # package = pkgs.capricorn.override { ... };
  };

  # Optional: Open firewall ports if Capricorn needs to be accessible
  # Note: Review your security requirements before opening ports
  # networking.firewall.allowedTCPPorts = [ 64187 ];
  # networking.firewall.allowedUDPPorts = [ ];

  # Optional: Configure log rotation for the service
  # services.logrotate.settings.capricorn = {
  #   files = "/var/log/capricorn/*.log";
  #   frequency = "daily";
  #   rotate = 7;
  #   compress = true;
  # };
}
