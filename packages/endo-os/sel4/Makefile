# Endo OS — seL4 Microkit Build
#
# Follows the official Microkit tutorial build pattern exactly.
# https://docs.sel4.systems/projects/microkit/tutorial/

MICROKIT_SDK    ?= /opt/microkit-sdk
MICROKIT_BOARD  ?= qemu_virt_aarch64
MICROKIT_CONFIG ?= debug
BUILD_DIR       := build

MICROKIT_TOOL := $(MICROKIT_SDK)/bin/microkit
BOARD_DIR     := $(MICROKIT_SDK)/board/$(MICROKIT_BOARD)/$(MICROKIT_CONFIG)

CC := aarch64-linux-gnu-gcc
LD := aarch64-linux-gnu-ld

CFLAGS := -mcpu=cortex-a53 -mstrict-align -nostdlib -ffreestanding \
          -g3 -O3 -Wall -Wno-unused-function \
          -I$(BOARD_DIR)/include

LDFLAGS := -L$(BOARD_DIR)/lib

LIBS := -lmicrokit -Tmicrokit.ld

.PHONY: all clean simulate

all: $(BUILD_DIR)/endo-os.img

$(BUILD_DIR)/endo_init.o: src/endo_init.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR)/endo-init.elf: $(BUILD_DIR)/endo_init.o
	$(LD) $(LDFLAGS) $< $(LIBS) -o $@

$(BUILD_DIR)/endo-os.img: $(BUILD_DIR)/endo-init.elf system.xml
	$(MICROKIT_TOOL) system.xml \
		--search-path $(BUILD_DIR) \
		--board $(MICROKIT_BOARD) \
		--config $(MICROKIT_CONFIG) \
		-o $@ \
		-r $(BUILD_DIR)/report.txt
	@echo ""
	@echo "=== seL4 image built ==="
	@ls -lh $@

simulate: $(BUILD_DIR)/endo-os.img
	qemu-system-aarch64 \
		-machine virt,virtualization=on \
		-cpu cortex-a53 \
		-m size=2G \
		-nographic \
		-serial mon:stdio \
		-device loader,file=$<,addr=0x70000000,cpu-num=0

clean:
	rm -rf $(BUILD_DIR)
