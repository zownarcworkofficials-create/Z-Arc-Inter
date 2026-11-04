import type { CompositeBuffer } from './CompositeBuffer.js';
/**
 * A utility class for writing data in the UMP format.
 */
export declare class UmpWriter {
    private compositeBuffer;
    constructor(compositeBuffer: CompositeBuffer);
    write(type: number, data: Uint8Array): void;
    private writeVarInt;
}
