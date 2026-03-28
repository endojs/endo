# Endo OS — seL4 Microkit Build
#
# Builds the endo-init PD and links it into a bootable seL4 image.
#
# Usage (via Docker — recommended):
#   ./build/build-sel4.sh
#
# Usage (native, requires Microkit SDK + AArch64 toolchain):
#   make MICROKIT_SDK=/path/to/sdk

# Configuration
MICROKIT_SDK    ?= /opt/microkit-sdk
MICROKIT_BOARD  ?= qemu_virt_aarch64
MICROKIT_CONFIG ?= debug
BUILD_DIR       := build

# Microkit SDK paths
MICROKIT_TOOL := $(MICROKIT_SDK)/bin/microkit
BOARD_DIR     := $(MICROKIT_SDK)/board/$(MICROKIT_BOARD)/$(MICROKIT_CONFIG)

# Rust target for seL4 on AArch64
RUST_TARGET := aarch64-unknown-none

# Cross compiler for any C dependencies (QuickJS)
CC  := aarch64-none-elf-gcc
AR  := aarch64-none-elf-ar

.PHONY: all clean simulate

all: $(BUILD_DIR)/endo-os.img

# Build the Rust PD as a static library, then link into an ELF.
$(BUILD_DIR)/endo-init.elf: src/lib.rs src/js_runtime.rs Cargo.toml
	@mkdir -p $(BUILD_DIR)
	SEL4_PREFIX=$(BOARD_DIR) \
	cargo build \
		--release \
		--target $(RUST_TARGET) \
		--target-dir $(BUILD_DIR)/cargo
	# The Microkit SDK expects an ELF with specific sections.
	cp $(BUILD_DIR)/cargo/$(RUST_TARGET)/release/libendo_os_sel4.a \
	   $(BUILD_DIR)/endo-init.a
	# Link into a PD ELF using the Microkit linker script.
	$(CC) -nostdlib -static \
		-T $(BOARD_DIR)/lib/microkit.ld \
		-L$(BOARD_DIR)/lib \
		$(BUILD_DIR)/endo-init.a \
		-lmicrokit \
		-o $@

# Use the Microkit tool to combine PD ELFs + system description
# into a bootable image.
$(BUILD_DIR)/endo-os.img: $(BUILD_DIR)/endo-init.elf system.xml
	$(MICROKIT_TOOL) system.xml \
		--search-path $(BUILD_DIR) \
		--board $(MICROKIT_BOARD) \
		--config $(MICROKIT_CONFIG) \
		-o $@ \
		-r $(BUILD_DIR)/report.txt
	@echo "=== seL4 image built ==="
	@echo "    Image:  $@"
	@echo "    Report: $(BUILD_DIR)/report.txt"
	@ls -lh $@

# Run in QEMU.
simulate: $(BUILD_DIR)/endo-os.img
	qemu-system-aarch64 \
		-machine virt,virtualization=on \
		-cpu cortex-a53 \
		-m 512M \
		-nographic \
		-serial mon:stdio \
		-device loader,file=$<,addr=0x70000000

clean:
	rm -rf $(BUILD_DIR)
	cargo clean
