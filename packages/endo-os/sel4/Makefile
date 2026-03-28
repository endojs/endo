# Endo OS — seL4 Microkit Build
#
# Builds the endo-init PD (C) and links it into a bootable seL4 image.
#
# Usage:
#   make MICROKIT_SDK=/path/to/sdk
#
# Or via Docker (recommended):
#   ./build/build-sel4.sh

# Configuration
MICROKIT_SDK    ?= /opt/microkit-sdk
MICROKIT_BOARD  ?= qemu_virt_aarch64
MICROKIT_CONFIG ?= debug
BUILD_DIR       := build

# Microkit SDK paths
MICROKIT_TOOL := $(MICROKIT_SDK)/bin/microkit
BOARD_DIR     := $(MICROKIT_SDK)/board/$(MICROKIT_BOARD)/$(MICROKIT_CONFIG)

# Cross compiler (aarch64-linux-gnu works for bare-metal ELFs too)
CC      := aarch64-linux-gnu-gcc
LD      := aarch64-linux-gnu-ld
OBJCOPY := aarch64-linux-gnu-objcopy

CFLAGS := -mcpu=cortex-a53 -mstrict-align -nostdlib -ffreestanding \
          -Wall -Wextra -O2 \
          -I$(BOARD_DIR)/include

LDFLAGS := -L$(BOARD_DIR)/lib -T$(BOARD_DIR)/lib/microkit.ld \
           --start-group -lmicrokit -Tmicrokit.ld --end-group

.PHONY: all clean simulate

all: $(BUILD_DIR)/endo-os.img

# Compile the PD.
$(BUILD_DIR)/endo_init.o: src/endo_init.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c -o $@ $<

# Link into an ELF.
$(BUILD_DIR)/endo-init.elf: $(BUILD_DIR)/endo_init.o
	$(LD) $< $(LDFLAGS) -o $@

# Use the Microkit tool to combine PD ELFs + system description
# into a bootable image.
$(BUILD_DIR)/endo-os.img: $(BUILD_DIR)/endo-init.elf system.xml
	$(MICROKIT_TOOL) system.xml \
		--search-path $(BUILD_DIR) \
		--board $(MICROKIT_BOARD) \
		--config $(MICROKIT_CONFIG) \
		-o $@ \
		-r $(BUILD_DIR)/report.txt
	@echo ""
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
