#
# XSnap WASM Build
#
# Build XS engine as a WebAssembly module without Emscripten
#

% : %.c
%.o : %.c

GOAL ?= debug
NAME = xs
ifneq ($(VERBOSE),1)
MAKEFLAGS += --silent
endif

# Paths
XSNAP_WASM_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
MODDABLE ?= $(XSNAP_WASM_DIR)../moddable
XS_DIR = $(MODDABLE)/xs
BUILD_DIR = $(XSNAP_WASM_DIR)build

BIN_DIR = $(BUILD_DIR)/bin/$(GOAL)
TMP_DIR = $(BUILD_DIR)/tmp/$(GOAL)/$(NAME)

INC_DIR = $(XS_DIR)/includes
PLT_DIR = $(XS_DIR)/platforms
SRC_DIR = $(XS_DIR)/sources
TLS_DIR = $(XS_DIR)/tools

# Our custom platform and libc
WASM_PLT_DIR = $(XSNAP_WASM_DIR)platforms
WASM_LIBC_DIR = $(XSNAP_WASM_DIR)libc
WASM_SRC_DIR = $(XSNAP_WASM_DIR)sources

# Use LLVM clang (not Apple clang) for wasm32 target support
# Install via: brew install llvm
LLVM_PREFIX ?= $(shell brew --prefix llvm 2>/dev/null || echo /usr/local/opt/llvm)
CC = $(LLVM_PREFIX)/bin/clang
AR = $(LLVM_PREFIX)/bin/llvm-ar

# WASI SDK provides wasm-ld and clang
WASI_SDK_PATH ?= $(HOME)/wasi-sdk
WASM_LD = $(WASI_SDK_PATH)/bin/wasm-ld

# WASM-specific flags
WASM_FLAGS = \
	--target=wasm32 \
	-nostdlib \
	-ffreestanding \
	-fno-builtin \
	-fvisibility=hidden \
	-mbulk-memory

C_OPTIONS = \
	$(WASM_FLAGS) \
	-DINCLUDE_XSPLATFORM \
	-DXSPLATFORM=\"wasm32_xs.h\" \
	-DmxParse=1 \
	-DmxRun=1 \
	-DmxStringNormalize=1 \
	-DmxMinusZero=1 \
	-DmxRegExpUnicodePropertyEscapes=1 \
	-DmxStringInfoCacheLength=4 \
	-I$(WASM_LIBC_DIR) \
	-I$(WASM_PLT_DIR) \
	-I$(INC_DIR) \
	-I$(PLT_DIR) \
	-I$(SRC_DIR) \
	-I$(TLS_DIR) \
	-I$(TLS_DIR)/fdlibm \
	-I$(TMP_DIR)

ifeq ($(GOAL),debug)
	C_OPTIONS += -g -O0 -DDEBUG=1
else
	# -O3 without LTO due to LLVM version mismatch with wasm-ld
	C_OPTIONS += -O3 -DNDEBUG=1
endif

# Optional features (can be enabled via make flags)
ifeq ($(LOCKDOWN),1)
	C_OPTIONS += -DmxLockdown=1
endif

ifeq ($(METERING),1)
	C_OPTIONS += -DmxMetering=1
endif

# Moddable modules (textencoder/textdecoder/base64 needed for basic functionality)
C_OPTIONS += -I$(MODDABLE)/modules/data/text/decoder
C_OPTIONS += -I$(MODDABLE)/modules/data/text/encoder
C_OPTIONS += -I$(MODDABLE)/modules/data/base64

# Snapshot support is always enabled - it's a key feature of XSnap
C_OPTIONS += -DmxSnapshot=1

ifeq ($(SLOPPY),1)
	C_OPTIONS += -DmxSloppy=1
endif

ifeq ($(BOUNDS_CHECK),1)
	C_OPTIONS += -DmxBoundsCheck=1
endif

# Core XS objects
OBJECTS = \
	$(TMP_DIR)/xsAll.o \
	$(TMP_DIR)/xsAPI.o \
	$(TMP_DIR)/xsArguments.o \
	$(TMP_DIR)/xsArray.o \
	$(TMP_DIR)/xsAtomics.o \
	$(TMP_DIR)/xsBigInt.o \
	$(TMP_DIR)/xsBoolean.o \
	$(TMP_DIR)/xsCode.o \
	$(TMP_DIR)/xsCommon.o \
	$(TMP_DIR)/xsDataView.o \
	$(TMP_DIR)/xsDate.o \
	$(TMP_DIR)/xsDebug.o \
	$(TMP_DIR)/xsDefaults.o \
	$(TMP_DIR)/xsError.o \
	$(TMP_DIR)/xsFunction.o \
	$(TMP_DIR)/xsGenerator.o \
	$(TMP_DIR)/xsGlobal.o \
	$(TMP_DIR)/xsJSON.o \
	$(TMP_DIR)/xsLexical.o \
	$(TMP_DIR)/xsLockdown.o \
	$(TMP_DIR)/xsMapSet.o \
	$(TMP_DIR)/xsMarshall.o \
	$(TMP_DIR)/xsMath.o \
	$(TMP_DIR)/xsMemory.o \
	$(TMP_DIR)/xsModule.o \
	$(TMP_DIR)/xsNumber.o \
	$(TMP_DIR)/xsObject.o \
	$(TMP_DIR)/xsPlatforms.o \
	$(TMP_DIR)/xsProfile.o \
	$(TMP_DIR)/xsPromise.o \
	$(TMP_DIR)/xsProperty.o \
	$(TMP_DIR)/xsProxy.o \
	$(TMP_DIR)/xsRegExp.o \
	$(TMP_DIR)/xsRun.o \
	$(TMP_DIR)/xsScope.o \
	$(TMP_DIR)/xsScript.o \
	$(TMP_DIR)/xsSourceMap.o \
	$(TMP_DIR)/xsString.o \
	$(TMP_DIR)/xsSymbol.o \
	$(TMP_DIR)/xsSyntaxical.o \
	$(TMP_DIR)/xsTree.o \
	$(TMP_DIR)/xsType.o \
	$(TMP_DIR)/xsdtoa.o \
	$(TMP_DIR)/xsre.o \
	$(TMP_DIR)/xsmc.o

# Moddable modules (textencoder/textdecoder/base64 needed for basic functionality)
OBJECTS += $(TMP_DIR)/textdecoder.o
OBJECTS += $(TMP_DIR)/textencoder.o
OBJECTS += $(TMP_DIR)/modBase64.o

# Snapshot support (always enabled)
OBJECTS += $(TMP_DIR)/xsSnapshot.o

# Platform implementation
OBJECTS += $(TMP_DIR)/wasm32_xs.o

# Our libc implementations
OBJECTS += $(TMP_DIR)/wasm_libc.o

# fdlibm math library (self-contained, no system libm needed)
OBJECTS += \
	$(TMP_DIR)/e_acos.o \
	$(TMP_DIR)/e_acosh.o \
	$(TMP_DIR)/e_asin.o \
	$(TMP_DIR)/e_atan2.o \
	$(TMP_DIR)/e_atanh.o \
	$(TMP_DIR)/e_cosh.o \
	$(TMP_DIR)/e_exp.o \
	$(TMP_DIR)/e_fmod.o \
	$(TMP_DIR)/e_hypot.o \
	$(TMP_DIR)/e_log.o \
	$(TMP_DIR)/e_log10.o \
	$(TMP_DIR)/e_pow.o \
	$(TMP_DIR)/e_rem_pio2.o \
	$(TMP_DIR)/e_sinh.o \
	$(TMP_DIR)/k_cos.o \
	$(TMP_DIR)/k_exp.o \
	$(TMP_DIR)/k_rem_pio2.o \
	$(TMP_DIR)/k_sin.o \
	$(TMP_DIR)/k_tan.o \
	$(TMP_DIR)/s_asinh.o \
	$(TMP_DIR)/s_atan.o \
	$(TMP_DIR)/s_cbrt.o \
	$(TMP_DIR)/s_ceil.o \
	$(TMP_DIR)/s_cos.o \
	$(TMP_DIR)/s_expm1.o \
	$(TMP_DIR)/s_log1p.o \
	$(TMP_DIR)/s_scalbn.o \
	$(TMP_DIR)/s_sin.o \
	$(TMP_DIR)/s_tan.o \
	$(TMP_DIR)/s_tanh.o \
	$(TMP_DIR)/s_trunc.o

VPATH += $(SRC_DIR) $(WASM_PLT_DIR) $(WASM_LIBC_DIR) $(WASM_SRC_DIR) $(TLS_DIR)/fdlibm

# Moddable modules needed for textencoder/textdecoder/base64
VPATH += $(MODDABLE)/modules/data/text/decoder
VPATH += $(MODDABLE)/modules/data/text/encoder
VPATH += $(MODDABLE)/modules/data/base64

# Link flags for WASM executable (passed directly to wasm-ld)
# Note: We export memory rather than import it for simpler host integration
WASM_LD_FLAGS = \
	--no-entry \
	--export-dynamic \
	--allow-undefined \
	--export-memory \
	--initial-memory=16777216 \
	--max-memory=268435456

# Worker object
WORKER_OBJ = $(TMP_DIR)/xsnap-wasm.o

.PHONY: all clean debug release lib wasm

all: debug

debug:
	$(MAKE) GOAL=debug build

release:
	$(MAKE) GOAL=release build

# Build both library and executable
build: $(TMP_DIR) $(BIN_DIR) $(BIN_DIR)/lib$(NAME).a $(BIN_DIR)/xsnap.wasm
	@echo "Built $(BIN_DIR)/lib$(NAME).a"
	@echo "Built $(BIN_DIR)/xsnap.wasm"

# Just the library
lib: $(TMP_DIR) $(BIN_DIR) $(BIN_DIR)/lib$(NAME).a
	@echo "Built $(BIN_DIR)/lib$(NAME).a"

# Just the wasm module (requires library)
wasm: $(TMP_DIR) $(BIN_DIR) $(BIN_DIR)/xsnap.wasm
	@echo "Built $(BIN_DIR)/xsnap.wasm"

$(TMP_DIR):
	mkdir -p $(TMP_DIR)

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

$(BIN_DIR)/lib$(NAME).a: $(OBJECTS)
	@echo "#" $(NAME) $(GOAL) ": ar" $(@F)
	$(AR) rcs $@ $(OBJECTS)

# Link WASM executable
$(BIN_DIR)/xsnap.wasm: $(WORKER_OBJ) $(BIN_DIR)/lib$(NAME).a
	@echo "#" $(NAME) $(GOAL) ": link" $(@F)
	@if [ ! -x "$(WASM_LD)" ]; then \
		echo "ERROR: wasm-ld not found. Install WASI SDK or LLVM with LLD."; \
		echo "  See README.md for installation instructions."; \
		exit 1; \
	fi
	$(WASM_LD) $(WASM_LD_FLAGS) -o $@ $(WORKER_OBJ) $(BIN_DIR)/lib$(NAME).a

# Worker source compilation
$(WORKER_OBJ): $(WASM_SRC_DIR)/xsnap-wasm.c
	@echo "#" $(NAME) $(GOAL) ": cc" $(<F)
	$(CC) $< $(C_OPTIONS) -c -o $@

# Dependencies
$(OBJECTS): $(WASM_PLT_DIR)/wasm32_xs.h
$(OBJECTS): $(PLT_DIR)/xsPlatform.h
$(OBJECTS): $(SRC_DIR)/xsCommon.h
$(OBJECTS): $(SRC_DIR)/xsAll.h
$(OBJECTS): $(SRC_DIR)/xsScript.h
$(OBJECTS): $(TLS_DIR)/fdlibm/math_private.h

$(TMP_DIR)/%.o: %.c
	@echo "#" $(NAME) $(GOAL) ": cc" $(<F)
	$(CC) $< $(C_OPTIONS) -c -o $@

clean:
	rm -rf $(BUILD_DIR)

