/**
 * A memory efficient buffer that manages discontinuous chunks as a single stream.
 * @NOTE
 * Based on https://gist.github.com/LuanRT/02d7eab589fb4080cd16e97f6dccf06f
 */
export declare class CompositeBuffer {
    chunks: Uint8Array[];
    currentChunkOffset: number;
    currentChunkIndex: number;
    currentDataView?: DataView;
    totalLength: number;
    constructor(chunks?: Uint8Array[]);
    /**
     * Appends a chunk or all chunks from another {@link CompositeBuffer} to this buffer.
     * Chunks using the same `ArrayBuffer` are merged into a single `Uint8Array` to reduce memory usage and keep the number of chunks low.
     * @param data - A `Uint8Array` to append, or another `CompositeBuffer` whose chunks will be appended individually.
     */
    append(data: Uint8Array | CompositeBuffer): void;
    /**
     * Splits this buffer at a specified position.
     * @param position - Offset at which to split the buffer.
     * @returns Obj containing the bytes before `position` as `extractedBuffer` and the bytes from `position` onward as `remainingBuffer`.
     */
    split(position: number): {
        extractedBuffer: CompositeBuffer;
        remainingBuffer: CompositeBuffer;
    };
    getLength(): number;
    canReadBytes(position: number, length: number): boolean;
    /**
     * Reads a single unsigned byte at the given position.
     */
    getUint8(position: number): number;
    /**
     * Moves the internal focus to the chunk containing the specified position.
     * If the position is before the currently focused chunk, focus is reset first.
     * Cached `currentDataView` is also invalidated.
     */
    focus(position: number): void;
    /**
     * Checks whether the internal focus already covers the specified position.
     * @returns `true` if `position` is within the currently focused chunk.
     */
    isFocused(position: number): boolean;
    /**
     * Resets the internal focus to the beginning of the buffer.
     */
    private resetFocus;
    /**
     * Determines whether the given chunk can be merged with the last chunk.
     * Merging is possible when both reference the same buffer and the
     * new chunk starts exactly where the current last chunk ends.
     */
    private canMergeWithLastChunk;
}
