/*
 * Serial I/O for seL4 Microkit.
 *
 * On x86_64: uses microkit_dbg_puts for output (goes through
 * seL4 debug syscall → serial). For input, uses seL4 debug
 * getchar syscall.
 *
 * On AArch64: uses PL011 UART via MMIO.
 */

#include "uart.h"
#include <microkit.h>

#if defined(__x86_64__) || defined(__i386__)

/* x86: All I/O through seL4 debug syscalls (no I/O port caps needed). */

void uart_init(uintptr_t base) {
    (void)base;
}

void uart_putc(char c) {
    char buf[2] = { c, 0 };
    microkit_dbg_puts(buf);
}

void uart_puts(const char *s) {
    microkit_dbg_puts(s);
}

int uart_rx_ready(void) {
    return 1;  /* Always "ready" — getchar will block in seL4 debug. */
}

int uart_getc(void) {
    /* TODO: Need I/O port capability for COM1 input on x86.
       For now, return -1 (no input available). The shell will
       still print its banner but can't accept commands. */
    return -1;
}

int uart_handle_irq(void) {
    return uart_getc();
}

int uart_readline(char *buf, int max_len) {
    int pos = 0;
    /* On x86 without I/O port caps, input is not available yet.
       Just return empty line to let the shell print and wait. */
    if (uart_getc() < 0) {
        buf[0] = '\0';
        /* Spin forever — the shell will hang here waiting for
           input. On real hardware or with I/O port caps, getc works. */
        for (;;) {}
        return -1;
    }
    while (pos < max_len - 1) {
        int c = uart_getc();
        if (c < 0 || c == 0) continue;

        if (c == '\r' || c == '\n') {
            uart_putc('\r');
            uart_putc('\n');
            break;
        }
        if (c == 127 || c == 8) {
            if (pos > 0) {
                pos--;
                microkit_dbg_puts("\b \b");
            }
            continue;
        }
        if (c == 3) {
            microkit_dbg_puts("^C\n");
            pos = 0;
            break;
        }
        if (c >= 32 && c < 127) {
            buf[pos++] = (char)c;
            uart_putc((char)c);
        }
    }
    buf[pos] = '\0';
    return pos;
}

#else

/* AArch64: PL011 UART via MMIO. */

static volatile unsigned int *uart_regs = 0;

void uart_init(uintptr_t base) {
    uart_regs = (volatile unsigned int *)base;
    uart_regs[0x030 / 4] = (1 << 0) | (1 << 8) | (1 << 9);
    uart_regs[0x038 / 4] = (1 << 4);
}

void uart_putc(char c) {
    if (!uart_regs) return;
    while (uart_regs[0x018 / 4] & (1 << 5)) {}
    uart_regs[0] = (unsigned int)c;
}

void uart_puts(const char *s) {
    while (*s) {
        if (*s == '\n') uart_putc('\r');
        uart_putc(*s++);
    }
}

int uart_rx_ready(void) {
    if (!uart_regs) return 0;
    return !(uart_regs[0x018 / 4] & (1 << 4));
}

int uart_getc(void) {
    if (!uart_regs || !uart_rx_ready()) return -1;
    return (int)(uart_regs[0] & 0xFF);
}

int uart_handle_irq(void) {
    uart_regs[0x044 / 4] = (1 << 4);
    return uart_getc();
}

int uart_readline(char *buf, int max_len) {
    int pos = 0;
    while (pos < max_len - 1) {
        while (!uart_rx_ready()) {}
        int c = uart_getc();
        if (c < 0) continue;
        if (c == '\r' || c == '\n') { uart_putc('\r'); uart_putc('\n'); break; }
        if (c == 127 || c == 8) { if (pos > 0) { pos--; uart_puts("\b \b"); } continue; }
        if (c == 3) { uart_puts("^C\n"); pos = 0; break; }
        if (c >= 32 && c < 127) { buf[pos++] = (char)c; uart_putc((char)c); }
    }
    buf[pos] = '\0';
    return pos;
}

#endif
