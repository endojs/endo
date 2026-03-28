/*
 * PL011 UART driver for seL4 Microkit on QEMU virt.
 */

#include "uart.h"
#include <microkit.h>

static volatile uint32_t *uart_regs = 0;

static inline void reg_write(uint32_t offset, uint32_t val) {
    uart_regs[offset / 4] = val;
}

static inline uint32_t reg_read(uint32_t offset) {
    return uart_regs[offset / 4];
}

void uart_init(uintptr_t base) {
    uart_regs = (volatile uint32_t *)base;

    /* Enable UART, TX, and RX. */
    reg_write(UART_CR, (1 << 0) | (1 << 8) | (1 << 9));

    /* Enable RX interrupt so we get notified on input. */
    reg_write(UART_IMSC, UART_IMSC_RXIM);
}

void uart_putc(char c) {
    if (!uart_regs) return;
    /* Wait for TX FIFO to have space. */
    while (reg_read(UART_FR) & UART_FR_TXFF) {}
    reg_write(UART_DR, (uint32_t)c);
}

void uart_puts(const char *s) {
    while (*s) {
        if (*s == '\n') uart_putc('\r');
        uart_putc(*s++);
    }
}

int uart_rx_ready(void) {
    if (!uart_regs) return 0;
    return !(reg_read(UART_FR) & UART_FR_RXFE);
}

int uart_getc(void) {
    if (!uart_regs) return -1;
    if (reg_read(UART_FR) & UART_FR_RXFE) return -1;
    return (int)(reg_read(UART_DR) & 0xFF);
}

int uart_handle_irq(void) {
    /* Clear the RX interrupt. */
    reg_write(UART_ICR, UART_IMSC_RXIM);
    return uart_getc();
}

int uart_readline(char *buf, int max_len) {
    int pos = 0;
    while (pos < max_len - 1) {
        /* Spin-wait for a character. On seL4 we should use
           notifications, but for the initial REPL this works. */
        while (!uart_rx_ready()) {}

        int c = uart_getc();
        if (c < 0) continue;

        if (c == '\r' || c == '\n') {
            uart_putc('\r');
            uart_putc('\n');
            break;
        }

        if (c == 127 || c == 8) {  /* Backspace / DEL */
            if (pos > 0) {
                pos--;
                uart_puts("\b \b");
            }
            continue;
        }

        if (c == 3) {  /* Ctrl-C */
            uart_puts("^C\n");
            pos = 0;
            break;
        }

        if (c >= 32 && c < 127) {
            buf[pos++] = (char)c;
            uart_putc((char)c);  /* Echo */
        }
    }
    buf[pos] = '\0';
    return pos;
}
