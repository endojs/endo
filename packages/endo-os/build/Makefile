# Endo OS Build
#
# Builds the endo-init binary (V8 + SES + bootstrap, static linked).
#
# Prerequisites:
#   - V8 built via build-v8.sh (provides libv8_monolith.a)
#   - libsodium-dev installed (for crypto bindings, Phase 1+)

ENDO_OS_DIR := $(shell dirname $(CURDIR))
SRC_DIR     := $(ENDO_OS_DIR)/src/v8-host
JS_DIR      := $(ENDO_OS_DIR)/src/js
BUILD_DIR   := $(CURDIR)

# V8 paths — set by build-v8.sh or override via environment.
V8_SRC     ?= $(BUILD_DIR)/_v8_src
V8_INCLUDE := $(V8_SRC)/v8/include
V8_OUT     := $(V8_SRC)/out/x64.release
V8_LIB     := $(V8_OUT)/obj/libv8_monolith.a

CXX      := g++
CXXFLAGS := -std=c++17 -O2 -Wall -Wextra \
            -I$(V8_INCLUDE) \
            -DV8_COMPRESS_POINTERS \
            -DV8_ENABLE_SANDBOX

# For static linking on Linux.  On macOS (development), dynamic
# linking is used instead since macOS doesn't support -static.
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Linux)
  LDFLAGS := -static -pthread -ldl -lm
else
  LDFLAGS := -pthread -ldl -lm
endif

# Source files.
SOURCES := $(SRC_DIR)/main.cc $(SRC_DIR)/platform.cc
OBJECTS := $(patsubst $(SRC_DIR)/%.cc,$(BUILD_DIR)/%.o,$(SOURCES))

# JS files to embed as binary blobs.
JS_LOCKDOWN := $(JS_DIR)/ses-lockdown.js
JS_BOOTSTRAP := $(JS_DIR)/bootstrap.js
JS_OBJECTS := $(BUILD_DIR)/ses-lockdown.js.o $(BUILD_DIR)/bootstrap.js.o

.PHONY: all clean

all: endo-init

# Link endo-init.
endo-init: $(OBJECTS) $(JS_OBJECTS)
	@echo "--- Linking endo-init ---"
	$(CXX) -o $@ $^ $(V8_LIB) $(LDFLAGS)
	@echo "--- endo-init built ($(shell du -h $@ | cut -f1)) ---"

# Compile C++ sources.
$(BUILD_DIR)/%.o: $(SRC_DIR)/%.cc
	@echo "--- Compiling $< ---"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

# Embed JS files as binary objects using objcopy.
# This creates symbols like _binary_ses_lockdown_js_start/end.
$(BUILD_DIR)/ses-lockdown.js.o: $(JS_LOCKDOWN)
	@echo "--- Embedding $< ---"
ifeq ($(UNAME_S),Linux)
	objcopy -I binary -O elf64-x86-64 -B i386:x86-64 \
		--rename-section .data=.rodata,alloc,load,readonly,data,contents \
		$< $@
else
	# macOS: convert to C array and compile.
	xxd -i $< | sed 's/unsigned char .*/const char _binary_ses_lockdown_js_start[] = {/' \
		| sed 's/unsigned int .*/};/' > $(BUILD_DIR)/_ses_lockdown_embed.c
	echo 'const char _binary_ses_lockdown_js_end[] = "";' >> $(BUILD_DIR)/_ses_lockdown_embed.c
	$(CC) -c -o $@ $(BUILD_DIR)/_ses_lockdown_embed.c
endif

$(BUILD_DIR)/bootstrap.js.o: $(JS_BOOTSTRAP)
	@echo "--- Embedding $< ---"
ifeq ($(UNAME_S),Linux)
	objcopy -I binary -O elf64-x86-64 -B i386:x86-64 \
		--rename-section .data=.rodata,alloc,load,readonly,data,contents \
		$< $@
else
	xxd -i $< | sed 's/unsigned char .*/const char _binary_bootstrap_js_start[] = {/' \
		| sed 's/unsigned int .*/};/' > $(BUILD_DIR)/_bootstrap_embed.c
	echo 'const char _binary_bootstrap_js_end[] = "";' >> $(BUILD_DIR)/_bootstrap_embed.c
	$(CC) -c -o $@ $(BUILD_DIR)/_bootstrap_embed.c
endif

clean:
	rm -f endo-init $(OBJECTS) $(JS_OBJECTS)
	rm -f $(BUILD_DIR)/_*_embed.c
