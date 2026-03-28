/*
 * PL011 UART driver for seL4 Microkit on QEMU virt.
 *
 * Provides character-level I/O over the serial console.
 * Used both for print output and for reading user input
 * into the Endo shell.
 */

#ifndef ENDO_UART_H
#define ENDO_UART_H

#include <stdint.h>

/* PL011 register offsets. */
#define UART_DR     0x000  /* Data register */
#define UART_FR     0x018  /* Flag register */
#define UART_IBRD   0x024  /* Integer baud rate */
#define UART_FBRD   0x028  /* Fractional baud rate */
#define UART_LCR_H  0x02C  /* Line control */
#define UART_CR     0x030  /* Control register */
#define UART_IMSC   0x038  /* Interrupt mask */
#define UART_ICR    0x044  /* Interrupt clear */

/* Flag register bits. */
#define UART_FR_RXFE  (1 << 4)  /* RX FIFO empty */
#define UART_FR_TXFF  (1 << 5)  /* TX FIFO full */

/* Interrupt bits. */
#define UART_IMSC_RXIM  (1 << 4)  /* RX interrupt mask */

/* Initialize the UART (enable RX interrupt). */
void uart_init(uintptr_t base);

/* Write a character. */
void uart_putc(char c);

/* Write a string. */
void uart_puts(const char *s);

/* Read a character (returns -1 if none available). */
int uart_getc(void);

/* Check if a character is available. */
int uart_rx_ready(void);

/* Handle UART IRQ (clear interrupt, return char or -1). */
int uart_handle_irq(void);

/* Read a line from the UART (blocking, with echo).
   Returns length, or -1 on error.  buf is null-terminated. */
int uart_readline(char *buf, int max_len);

#endif
