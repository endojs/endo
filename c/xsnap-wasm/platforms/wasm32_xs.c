/*
 * Copyright (c) 2016-2025  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 *
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 */

#include "xsAll.h"

/*
 * Host imports - these are provided by the WASM host (Go/JS)
 */

/* Time - imported from host */
__attribute__((import_module("env"), import_name("wasm_time_now_ms")))
extern long long wasm_time_now_ms(void);

static c_tm gLocalTime;

c_tm* wasm_localtime(const c_time_t* timep) {
    /* Simplified: just return zeros, host should provide real time if needed */
    (void)timep;
    c_memset(&gLocalTime, 0, sizeof(gLocalTime));
    return &gLocalTime;
}

c_time_t wasm_mktime(c_tm* tm) {
    (void)tm;
    return 0;
}

int wasm_gettimeofday(c_timeval* tp, void* tzp) {
    (void)tzp;
    if (tp) {
        long long ms = wasm_time_now_ms();
        tp->tv_sec = ms / 1000;
        tp->tv_usec = (ms % 1000) * 1000;
    }
    return 0;
}

/*
 * XS Platform hooks
 */

void fxCreateMachinePlatform(txMachine* the) {
    (void)the;
}

void fxDeleteMachinePlatform(txMachine* the) {
    (void)the;
}

void fxQueuePromiseJobs(txMachine* the) {
    the->promiseJobs = 1;
}

/*
 * Shared cluster - single machine for WASM, no threading
 * Signatures from xsAll.h:
 *   extern void fxInitializeSharedCluster(txMachine* the);
 *   extern void fxTerminateSharedCluster(txMachine* the);
 */

void fxInitializeSharedCluster(txMachine* the) {
    (void)the;
}

void fxTerminateSharedCluster(txMachine* the) {
    (void)the;
}

/*
 * Module loading - stub, host provides modules via buffer
 * Signatures from xsAll.h:
 *   extern txID fxFindModule(txMachine* the, txSlot* realm, txID moduleID, txSlot* slot);
 *   extern void fxLoadModule(txMachine* the, txSlot* module, txID moduleID);
 */

txID fxFindModule(txMachine* the, txSlot* realm, txID moduleID, txSlot* slot) {
    (void)the;
    (void)realm;
    (void)moduleID;
    (void)slot;
    return XS_NO_ID;
}

void fxLoadModule(txMachine* the, txSlot* module, txID moduleID) {
    (void)the;
    (void)module;
    (void)moduleID;
}

/*
 * Debug - stubs for now
 */

#ifdef mxDebug
void fxConnect(txMachine* the) {
    (void)the;
}

void fxDisconnect(txMachine* the) {
    (void)the;
}

txBoolean fxIsConnected(txMachine* the) {
    (void)the;
    return 0;
}

txBoolean fxIsReadable(txMachine* the) {
    (void)the;
    return 0;
}

void fxReceive(txMachine* the) {
    (void)the;
}

void fxSend(txMachine* the, txBoolean more) {
    (void)the;
    (void)more;
}
#endif

/*
 * Timer - stub
 */

void fxClearTimer(txMachine* the) {
    (void)the;
}

void fxSetTimer(txMachine* the, txNumber interval, txBoolean repeat) {
    (void)the;
    (void)interval;
    (void)repeat;
}

/*
 * Run loop - for promises
 */

void fxRunLoop(txMachine* the) {
    /* Run promise jobs until none remain */
    while (the->promiseJobs) {
        the->promiseJobs = 0;
        fxRunPromiseJobs(the);
    }
}
