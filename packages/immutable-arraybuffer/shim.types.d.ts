declare global {
  // This syntax extends the global ArrayBuffer interface
  interface ArrayBuffer {
    /**
     * Creates an immutable slice of the given buffer.
     *
     * @param start The start index.
     * @param end The end index.
     * @returns The sliced immutable ArrayBuffer.
     */
    sliceToImmutable: (start?: number, end?: number) => ArrayBuffer;

    /**
     * Transfer the contents to a new immutable ArrayBuffer
     *
     * @param newLength The start index.
     * @returns The new immutable ArrayBuffer.
     */
    transferToImmutable: (newLength?: number) => ArrayBuffer;

    /**
     * Whether the buffer is immutable.
     */
    immutable: boolean;
  }
}

export {};
