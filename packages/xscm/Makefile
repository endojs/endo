MODDABLE=$(PWD)/moddable
TOOLS=$(MODDABLE)/build/bin/lin/release/
ROOT=$(PWD)/../..

SRCS=main.js src/xscm.js src/harden.js src/console.js

PLATFORM=x-cli-lin
build/bin/lin/debug/xscm: build $(TOOLS)/mcconfig moddable/xs/platforms/lin_xs.c \
		manifest.json $(SRCS)
	ROOT=$(ROOT) PATH=$(TOOLS):$$PATH MODDABLE=$(MODDABLE) mcconfig -o build -d -p $(PLATFORM) -m

build:
	mkdir -p build

run: build/bin/lin/debug/xscm
	./build/bin/lin/debug/xscm

# compartmap.json: src/vatWorker.js package.json
# 	node -r esm tools/findmods.js $(ROOT) src/main.js >$@

clean:
	rm -rf build
