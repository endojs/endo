/* Standalone assert stub — kept separate to avoid header conflicts. */
extern void microkit_dbg_puts(const char *s);

void __assert_fail(const char *expr, const char *file,
                   unsigned int line, const char *func) {
    (void)line; (void)func;
    microkit_dbg_puts("ASSERT FAILED: ");
    if (expr) microkit_dbg_puts(expr);
    microkit_dbg_puts(" at ");
    if (file) microkit_dbg_puts(file);
    microkit_dbg_puts("\n");
    for (;;) {}
}
