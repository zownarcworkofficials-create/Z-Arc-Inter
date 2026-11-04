import { EmsgSegmentMetadata } from './EmsgSegmentMetadata.js';
export declare function stripMp4Init(segment: Uint8Array): Uint8Array;
export declare function stripWebmInit(segment: Uint8Array): Uint8Array;
export declare function parseEmsgSegmentMetadata(buffer: Uint8Array): EmsgSegmentMetadata | undefined;
