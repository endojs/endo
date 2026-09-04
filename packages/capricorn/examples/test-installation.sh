#!/usr/bin/env bash
# Test script for Capricorn Nix installation
# This script helps verify that Capricorn is properly installed and running

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

print_header() {
    echo ""
    echo "================================================"
    echo "$1"
    echo "================================================"
}

# Check if running as root for systemd checks
IS_ROOT=false
if [ "$EUID" -eq 0 ]; then
    IS_ROOT=true
fi

# Test 1: Check if capricorn-server is in PATH
print_header "Test 1: Checking if capricorn-server is available"
if command -v capricorn-server &> /dev/null; then
    CAPRICORN_PATH=$(which capricorn-server)
    print_success "capricorn-server found at: $CAPRICORN_PATH"
else
    print_error "capricorn-server not found in PATH"
    print_info "Install with: nix profile install github:endojs/endo/your-branch?dir=packages/capricorn"
    exit 1
fi

# Test 2: Check if Node.js is available
print_header "Test 2: Checking Node.js availability"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
else
    print_error "Node.js not found"
    exit 1
fi

# Test 3: Check if systemd service exists (if running as root or with sudo)
print_header "Test 3: Checking systemd service (requires root)"
if $IS_ROOT || sudo -n true 2>/dev/null; then
    if systemctl list-unit-files | grep -q "capricorn.service"; then
        print_success "capricorn.service unit file exists"

        # Check service status
        if systemctl is-active --quiet capricorn; then
            print_success "capricorn service is running"

            # Show service status
            echo ""
            echo "Service status:"
            systemctl status capricorn --no-pager -l | head -n 20
        else
            print_error "capricorn service exists but is not running"
            print_info "Start with: sudo systemctl start capricorn"
        fi
    else
        print_info "capricorn.service not found (service may not be enabled in NixOS configuration)"
    fi
else
    print_info "Skipping systemd checks (requires root access)"
fi

# Test 4: Check if storage directory exists
print_header "Test 4: Checking storage directory"
STORAGE_DIRS=(
    "/var/lib/capricorn"
    "$HOME/.capricorn"
)

STORAGE_FOUND=false
for dir in "${STORAGE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        print_success "Storage directory found: $dir"
        STORAGE_FOUND=true

        # Check for storage file
        if [ -f "$dir/capricorn-storage.json" ]; then
            print_success "Storage file exists: $dir/capricorn-storage.json"

            # Show storage file contents (if readable)
            if [ -r "$dir/capricorn-storage.json" ]; then
                echo ""
                echo "Storage file contents:"
                cat "$dir/capricorn-storage.json" | head -n 20
            fi
        else
            print_info "Storage file not yet created (will be created on first run)"
        fi
    fi
done

if ! $STORAGE_FOUND; then
    print_info "No storage directory found yet (will be created on first run)"
fi

# Test 5: Check recent logs (if systemd service exists)
print_header "Test 5: Checking recent logs"
if $IS_ROOT || sudo -n true 2>/dev/null; then
    if systemctl list-unit-files | grep -q "capricorn.service"; then
        echo "Recent capricorn logs:"
        echo "---"
        journalctl -u capricorn -n 20 --no-pager 2>/dev/null || print_info "No logs available yet"
        echo "---"

        # Try to extract admin swissnum from logs
        ADMIN_SWISSNUM=$(journalctl -u capricorn --no-pager 2>/dev/null | grep -oP "Admin facet swissnum: \K\w+" | tail -n 1 || echo "")
        if [ -n "$ADMIN_SWISSNUM" ]; then
            echo ""
            print_success "Admin swissnum found in logs: $ADMIN_SWISSNUM"
            echo ""
            echo "To connect a client, set these environment variables:"
            echo "  export CAPRICORN_ADMIN_SWISSNUM=$ADMIN_SWISSNUM"
            echo "  export CAPRICORN_LOCATION=127.0.0.1:64187"
        fi
    fi
else
    print_info "Skipping log checks (requires root access)"
fi

# Test 6: Check network ports (if service is running)
print_header "Test 6: Checking network ports"
if command -v ss &> /dev/null; then
    LISTENING_PORTS=$(ss -tlnp 2>/dev/null | grep node || echo "")
    if [ -n "$LISTENING_PORTS" ]; then
        print_success "Node.js is listening on ports:"
        echo "$LISTENING_PORTS"
    else
        print_info "No Node.js ports found listening (service may not be running)"
    fi
else
    print_info "ss command not available, skipping port check"
fi

# Test 7: Environment variables
print_header "Test 7: Checking environment variables"
ENV_VARS=(
    "CAPRICORN_STORAGE_FILE"
    "CAPRICORN_ADMIN_SWISSNUM"
    "CAPRICORN_LOCATION"
)

ENV_FOUND=false
for var in "${ENV_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        print_success "$var is set: ${!var}"
        ENV_FOUND=true
    fi
done

if ! $ENV_FOUND; then
    print_info "No Capricorn environment variables set (this is normal for systemd service)"
    echo ""
    echo "For manual operation, you can set:"
    echo "  export CAPRICORN_STORAGE_FILE=\$HOME/.capricorn/capricorn-storage.json"
    echo "  export CAPRICORN_ADMIN_SWISSNUM=<your-admin-swissnum>"
    echo "  export CAPRICORN_LOCATION=127.0.0.1:64187"
fi

# Test 8: Test basic execution (if not running as service)
print_header "Test 8: Testing basic execution"
if ! (systemctl is-active --quiet capricorn 2>/dev/null); then
    print_info "Attempting to start capricorn-server for 5 seconds..."

    # Create temporary storage directory
    TEMP_DIR=$(mktemp -d)
    export CAPRICORN_STORAGE_FILE="$TEMP_DIR/test-storage.json"

    timeout 5s capricorn-server > "$TEMP_DIR/output.log" 2>&1 &
    SERVER_PID=$!

    sleep 2

    if kill -0 $SERVER_PID 2>/dev/null; then
        print_success "Server started successfully (PID: $SERVER_PID)"

        # Check if storage file was created
        if [ -f "$CAPRICORN_STORAGE_FILE" ]; then
            print_success "Storage file created: $CAPRICORN_STORAGE_FILE"
        fi

        # Show output
        echo ""
        echo "Server output:"
        echo "---"
        cat "$TEMP_DIR/output.log"
        echo "---"

        # Kill the test server
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    else
        print_error "Server failed to start"
        echo ""
        echo "Error output:"
        cat "$TEMP_DIR/output.log"
    fi

    # Cleanup
    rm -rf "$TEMP_DIR"
else
    print_info "Skipping execution test (service is already running)"
fi

# Summary
print_header "Summary"
echo ""
echo "Installation test complete!"
echo ""
echo "Next steps:"
echo "  1. If using NixOS, enable the service in your configuration.nix:"
echo "     services.capricorn.enable = true;"
echo ""
echo "  2. If running manually, start the server:"
echo "     capricorn-server"
echo ""
echo "  3. Note the admin swissnum from the logs"
echo ""
echo "  4. Use the register.js example to connect and create routes"
echo ""
echo "For more information, see:"
echo "  - QUICKSTART_NIX.md"
echo "  - NIX_USAGE.md"
echo "  - README.md"
echo ""
