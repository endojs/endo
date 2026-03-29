# Endo OS — seL4 Microkit Build (x86_64)

MICROKIT_SDK    ?= /opt/microkit-sdk
MICROKIT_BOARD  ?= x86_64_generic
MICROKIT_CONFIG ?= debug
QUICKJS_SRC     ?= /opt/quickjs
BUILD_DIR       := build

MICROKIT_TOOL := $(MICROKIT_SDK)/bin/microkit
BOARD_DIR     := $(MICROKIT_SDK)/board/$(MICROKIT_BOARD)/$(MICROKIT_CONFIG)

CC := x86_64-linux-gnu-gcc
LD := x86_64-linux-gnu-ld

GCC_LIB_DIR := $(shell dirname $(shell x86_64-linux-gnu-gcc -print-libgcc-file-name 2>/dev/null || echo /usr/lib/gcc-cross/x86_64-linux-gnu/13/libgcc.a))

CFLAGS := -m64 -nostdlib -ffreestanding \
          -g3 -O2 -Wall -Wno-unused-function -Wno-unused-variable \
          -Wno-implicit-function-declaration -Wno-sign-compare \
          -Wno-missing-field-initializers -Wno-format \
          -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 \
          -I$(BOARD_DIR)/include \
          -Isrc \
          -I$(QUICKJS_SRC) \
          -DCONFIG_VERSION=\"endo-os\" \
          -D_GNU_SOURCE

LDFLAGS := -L$(BOARD_DIR)/lib -L$(GCC_LIB_DIR)
LIBS := -lmicrokit -Tmicrokit.ld -lgcc

# PD sources.
PD_OBJS := $(BUILD_DIR)/endo_init.o \
           $(BUILD_DIR)/uart.o \
           $(BUILD_DIR)/heap.o \
           $(BUILD_DIR)/libc_stubs.o

# QuickJS-ng core.
QJS_OBJS := $(BUILD_DIR)/quickjs.o \
            $(BUILD_DIR)/libregexp.o \
            $(BUILD_DIR)/libunicode.o \
            $(BUILD_DIR)/dtoa.o

# Embedded JS/bytecode.
JS_OBJS := $(BUILD_DIR)/js_ses_shim.o \
           $(BUILD_DIR)/js_eventual_send.o \
           $(BUILD_DIR)/daemon_bytecode.o \
           $(BUILD_DIR)/js_daemon_powers.o \
           $(BUILD_DIR)/js_bootstrap.o

ALL_OBJS := $(PD_OBJS) $(QJS_OBJS) $(JS_OBJS)

.PHONY: all clean simulate

all: $(BUILD_DIR)/endo-os.img

$(BUILD_DIR)/endo_init.o: src/endo_init.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR)/uart.o: src/uart.c
	$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR)/heap.o: src/heap.c
	$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR)/libc_stubs.o: src/libc_stubs.c
	$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR)/quickjs.o: $(QUICKJS_SRC)/quickjs.c
	$(CC) $(CFLAGS) -Wno-type-limits -Wno-array-bounds -c -o $@ $<

$(BUILD_DIR)/libregexp.o: $(QUICKJS_SRC)/libregexp.c
	$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR)/libunicode.o: $(QUICKJS_SRC)/libunicode.c
	$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR)/dtoa.o: $(QUICKJS_SRC)/dtoa.c
	$(CC) $(CFLAGS) -c -o $@ $<

# --- SES shim ---
$(BUILD_DIR)/js_ses_shim.o: src/ses-shim.js
	@mkdir -p $(BUILD_DIR)
	@echo "const char js_ses_shim[] = {" > $(BUILD_DIR)/js_ses_shim.c
	xxd -i < $< >> $(BUILD_DIR)/js_ses_shim.c
	@echo ", 0x00 };" >> $(BUILD_DIR)/js_ses_shim.c
	@echo "const int js_ses_shim_len = sizeof(js_ses_shim) - 1;" >> $(BUILD_DIR)/js_ses_shim.c
	$(CC) $(CFLAGS) -c -o $@ $(BUILD_DIR)/js_ses_shim.c

# --- Eventual-send ---
$(BUILD_DIR)/js_eventual_send.o: src/eventual-send.js
	@mkdir -p $(BUILD_DIR)
	@echo "const char js_eventual_send[] = {" > $(BUILD_DIR)/js_eventual_send.c
	xxd -i < $< >> $(BUILD_DIR)/js_eventual_send.c
	@echo ", 0x00 };" >> $(BUILD_DIR)/js_eventual_send.c
	@echo "const int js_eventual_send_len = sizeof(js_eventual_send) - 1;" >> $(BUILD_DIR)/js_eventual_send.c
	$(CC) $(CFLAGS) -c -o $@ $(BUILD_DIR)/js_eventual_send.c

# --- Daemon bytecode ---
$(BUILD_DIR)/daemon_bytecode.o: src/daemon-bytecode.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c -o $@ $<

# --- Daemon powers ---
$(BUILD_DIR)/js_daemon_powers.o: src/daemon-powers.js
	@mkdir -p $(BUILD_DIR)
	@echo "const char js_daemon_powers[] = {" > $(BUILD_DIR)/js_daemon_powers.c
	xxd -i < $< >> $(BUILD_DIR)/js_daemon_powers.c
	@echo ", 0x00 };" >> $(BUILD_DIR)/js_daemon_powers.c
	@echo "const int js_daemon_powers_len = sizeof(js_daemon_powers) - 1;" >> $(BUILD_DIR)/js_daemon_powers.c
	$(CC) $(CFLAGS) -c -o $@ $(BUILD_DIR)/js_daemon_powers.c

# --- Bootstrap shell ---
$(BUILD_DIR)/js_bootstrap.o: src/bootstrap.js
	@mkdir -p $(BUILD_DIR)
	@echo "const char js_bootstrap[] = {" > $(BUILD_DIR)/js_bootstrap.c
	xxd -i < $< >> $(BUILD_DIR)/js_bootstrap.c
	@echo ", 0x00 };" >> $(BUILD_DIR)/js_bootstrap.c
	@echo "const int js_bootstrap_len = sizeof(js_bootstrap) - 1;" >> $(BUILD_DIR)/js_bootstrap.c
	$(CC) $(CFLAGS) -c -o $@ $(BUILD_DIR)/js_bootstrap.c

# --- Link ---
$(BUILD_DIR)/endo-init.elf: $(ALL_OBJS)
	$(LD) $(LDFLAGS) $(ALL_OBJS) $(LIBS) -o $@
	@echo "endo-init.elf: $$(ls -lh $@ | awk '{print $$5}')"

# --- Microkit image ---
$(BUILD_DIR)/endo-os.img: $(BUILD_DIR)/endo-init.elf system.xml
	$(MICROKIT_TOOL) system.xml \
		--search-path $(BUILD_DIR) \
		--board $(MICROKIT_BOARD) \
		--config $(MICROKIT_CONFIG) \
		-o $@ \
		-r $(BUILD_DIR)/report.txt
	@echo ""
	@echo "=== seL4 x86_64 image built ==="
	@ls -lh $@

simulate: $(BUILD_DIR)/endo-os.img
	qemu-system-x86_64 \
		-cpu qemu64,+fsgsbase,+pdpe1gb,+xsaveopt,+xsave \
		-m 1G \
		-nographic \
		-serial mon:stdio \
		-kernel $(BOARD_DIR)/bin/sel4_32.elf \
		-initrd $<

clean:
	rm -rf $(BUILD_DIR)
