import type { UMPPartId } from '../utils/Protos.js';
import { CompositeBuffer } from './CompositeBuffer.js';
export interface UmpReaderCallbacks {
    /**
     * Called when a complete UMP part is available.
     */
    onPart(type: UMPPartId, data: CompositeBuffer): void | Promise<void>;
    /**
     * Only use this if you wish to handle partial UMP parts yourself.
     */
    onPartialPart?(type: UMPPartId, chunk: CompositeBuffer, offset: number, totalSize: number): boolean;
}
/**
 * An efficient UMP reader.
 * @NOTE
 * Based on https://gist.github.com/LuanRT/7c8c79fa558f2430f0b85b09f8a9d818
 */
export declare class UmpReader {
    private callbacks;
    private compositeBuffer;
    private pendingType?;
    private pendingOffset?;
    private pendingTotalSize?;
    constructor(callbacks: UmpReaderCallbacks);
    feed(chunk: Uint8Array | CompositeBuffer): Promise<void>;
    private parse;
    /**
     * Reads a specific varint from the current buffer offset.
     * @returns [decodedValue, updatedOffset] or [-1, originalOffset] if incomplete.
     */
    readVarInt(offset: number): [number, number];
    /**
     * Checks if the specified bytes can be read from the current chunk.
     * @param offset - Position to start reading from.
     * @param length - Number of bytes to read.
     * @returns True if bytes can be read from current chunk, false otherwise.
     */
    canReadFromCurrentChunk(offset: number, length: number): boolean;
    /**
     * Gets a DataView of the current chunk, creating it if necessary.
     * @returns DataView for the current chunk.
     */
    getCurrentDataView(): DataView;
    dispose(): void;
}
