/*
 * Endo OS — seL4 Microkit Protection Domain (Phase 0a)
 *
 * The simplest possible Microkit PD: boots on the formally
 * verified kernel and prints to serial console.
 *
 * This uses the C Microkit SDK directly.  QuickJS will be
 * added on top once this boots successfully.
 *
 * Microkit PD entry points:
 *   init()                  — called once at boot
 *   notified(channel)       — called on notification
 *   fault(child, msginfo)   — called on child fault
 */

#include <microkit.h>
#include <stdint.h>

/* Provided by the Microkit system description (setvar_vaddr). */
uintptr_t js_heap_vaddr;

void init(void) {
    microkit_dbg_puts("endo-init: Endo OS starting (seL4 Microkit)\n");
    microkit_dbg_puts("endo-init: Formally verified capability-native OS\n");
    microkit_dbg_puts("\n");

    /* Verify we have the JS heap memory region mapped. */
    if (js_heap_vaddr != 0) {
        microkit_dbg_puts("endo-init: JS heap mapped at 0x");
        /* Simple hex print (no printf available). */
        char hex[17];
        uintptr_t v = js_heap_vaddr;
        for (int i = 15; i >= 0; i--) {
            int d = v & 0xF;
            hex[i] = d < 10 ? '0' + d : 'a' + d - 10;
            v >>= 4;
        }
        hex[16] = '\0';
        microkit_dbg_puts(hex);
        microkit_dbg_puts(" (16 MB)\n");
    }

    microkit_dbg_puts("\n");
    microkit_dbg_puts("========================================\n");
    microkit_dbg_puts(" Endo OS Phase 0a: seL4 Boot\n");
    microkit_dbg_puts("\n");
    microkit_dbg_puts(" seL4 kernel:    formally verified\n");
    microkit_dbg_puts(" Microkit PD:    running\n");
    microkit_dbg_puts(" JS heap:        mapped (16 MB)\n");
    microkit_dbg_puts(" QuickJS:        next step\n");
    microkit_dbg_puts("\n");
    microkit_dbg_puts(" Capabilities all the way down.\n");
    microkit_dbg_puts("========================================\n");

    /*
     * Phase 0b: Initialize QuickJS here.
     *
     *   #include "quickjs.h"
     *   JSRuntime *rt = JS_NewRuntime();
     *   JSContext *ctx = JS_NewContext(rt);
     *   JS_Eval(ctx, ses_lockdown_js, ...);
     *   JS_Eval(ctx, bootstrap_js, ...);
     *
     * QuickJS needs only malloc/free.  We'll implement a simple
     * bump allocator over the js_heap memory region.
     */
}

void notified(microkit_channel channel) {
    microkit_dbg_puts("endo-init: notification on channel ");
    char ch = '0' + (char)(channel % 10);
    microkit_dbg_puts(&ch);
    microkit_dbg_puts("\n");

    /*
     * Phase 1+: dispatch device I/O completions.
     *
     * switch (channel) {
     *   case DISK_CHANNEL:
     *     handle_disk_completion();
     *     break;
     *   case NET_CHANNEL:
     *     handle_net_completion();
     *     break;
     * }
     */
}
