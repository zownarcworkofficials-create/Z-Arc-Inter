import type { MediaHeader } from './Protos.js';
import type { TrackCollection } from './TrackCollection.js';
import type { CompositeBuffer } from '../core/CompositeBuffer.js';
export declare class SabrSegmentBuffer {
    private readonly trackMetadata;
    private readonly isBroadcast;
    private readonly stripDuplicateInit;
    private readonly logger;
    private readonly pendingSegments;
    constructor(trackMetadata: TrackCollection, isBroadcast?: boolean, stripDuplicateInit?: boolean);
    reset(): void;
    queueMediaHeader(mediaHeader: MediaHeader): void;
    appendMediaData(headerId: number, buffer: CompositeBuffer): void;
    finalizeSegment(headerId: number): boolean;
}
